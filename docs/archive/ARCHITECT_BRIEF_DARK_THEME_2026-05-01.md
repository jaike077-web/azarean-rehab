# Бриф для архитектора — Dark theme и mobile ThemeToggle

**Дата:** 2026-05-01
**Состояние:** на проде задеплоен полу-готовый Dark theme (Push 9-11). Юзер видит сломанные экраны (white-on-white текст в dark, поломанный mobile header). Нужен дизайн-ревью + продуманная палитра.

---

## TL;DR

Закончил большую CSS-миграцию (CSS Modules + добавление dark theme + design tokens). Техническая часть работает: токены инжектятся, theme переключается, prefers-color-scheme detect'ит ОС. **Но визуально dark theme — наивная инверсия**, без продуманной иерархии глубины и контрастов. Mobile header сломан переключателем темы. Нужен дизайн палитры и mobile-layout от человека со скилом.

Я могу зафиксить технически по любым твоим спекам, но **проектировать визуальный язык — не моя сильная сторона**.

---

## 0. Project context (на случай если ты не в курсе текущего состояния)

### 0.1 Что за продукт
**Azarean Rehab** — платформа реабилитации для физиотерапевтической студии Azarean Network (Екатеринбург). Создание персонализированных комплексов упражнений, отслеживание прогресса пациентов, программы реабилитации (плечо, колено), Telegram-бот для напоминаний.

- **URL prod:** https://my.azarean.ru (single subdomain — frontend SPA + /api proxy на Express)
- **VDS:** 185.93.109.234 (shared с JARVIS Director — оба проекта на одной машине)
- **Прод pilot:** 0 живых пациентов, ~2 тестовых; коммерческий запуск ещё впереди
- **Команда:** 1 разработчик (Вадим), архитектор удалённо, я (AI) — основной исполнитель

### 0.2 Стек
- **Frontend:** React 19.2 + CRA 5 (no TypeScript), Axios, @dnd-kit, lucide-react, react-router-dom 7
- **Backend:** Node 20 + Express 5 (CommonJS) + pg 8 raw SQL, JWT + httpOnly cookie auth
- **БД:** PostgreSQL 18, ~20 таблиц
- **Видео упражнений:** Kinescope API (~1000 видео)
- **Email:** Y360 SMTP primary + Resend fallback (с 2026-04-29)
- **Observability:** Telegram ops-bot @vadim_azarenkov (Sentry заблокирован для русских IP)
- **CI/CD:** GitHub Actions → SSH deploy на VDS, pm2 zero-downtime reload
- **Тесты:** Jest + Supertest backend (293), Jest + RTL frontend (209)

### 0.3 Что было сделано вчера (2026-04-29)
Большой день — закрыты архитектор-priority задачи:
- **Telegram ops-bot для error alerts** (заменил Sentry, который блочит русские IP)
- **iPhone OAuth BIGINT баг** — Telegram OIDC sub > 9.22e18 → миграция NUMERIC(20)
- **OAuth boundary tests** — 18 тестов покрыли match-flow (returning / phone-autolink / no-match / multi-match anti-misroute / claimed-account / state-expired)
- **Yandex OAuth 2.0** — без OIDC discovery, без прокси (Yandex доступен с rehab-VDS напрямую)
- **Email через Y360 SMTP** — серверы в РФ закрывают 152-ФЗ; DNS на NetAngels (TXT yandex-verification + MX + DKIM multi-string + SPF объединённый)
- **Rate-limit на OAuth callbacks** + tg-proxy monitoring cron
- **GDPR data export** (`GET /me/data-export` — JSON со всеми данными)
- **Self-delete + 30-day grace** (`DELETE /me`, миграция `patient_deletion_queue` + cron 03:30 МСК)
- **Schema drift detection cron** — daily pg_dump diff против baseline в /var/lib/

### 0.4 Что сделано СЕГОДНЯ (2026-05-01) — это чем тебя загружают
**Большая CSS-миграция в одну сессию, 14 commits, 11 push'ей в main:**

```
c8834b5 fix(css): переименовать dash-case → camelCase (КРИТИЧНО — без этого s.foo undefined)
0584861 fix(sw): bump CACHE_NAME v2 → v3 (инвалидация кеша после миграции)
1979cee refactor(theme): хардкод цветов → токены (43 module.css)
152314e feat(theme): ThemeContext + переключатель в Profile/Dashboard
329a1ba feat(theme): расширить tokens.css dark-палитрой + auto prefers-color-scheme
7705759 refactor(css): components + остатки + удаление common.css
670ef06 refactor(css): Exercises страница + 6 компонентов
def1a1e refactor(css): CreateComplex + EditComplex + EditTemplate (DnD-критично)
b619d94 refactor(css): Patients (834 строки)
2b50615 refactor(css): MyComplexes + переезд .exercise-description
d7e4a95 refactor(css): Diagnoses + Trash
2fdae91 refactor(css): Login + PatientAuth + Admin
4e06a72 chore(css): удалить мёртвый ExercisesTemp.css
232cdc4 feat(css): добавить базовые design tokens
```

**Грабли которые поймали по ходу:**
1. **CRA не делает auto-camelCase в CSS Modules** — class `.patient-auth-container` доступен как `s['patient-auth-container']`, **но не** `s.patientAuthContainer`. Тесты с Proxy-mock не ловят (Proxy возвращает любой ключ как строку), в браузере — undefined. Юзер сообщил после Push 11, я закрыл commit `c8834b5` (Python скрипт переименовал все dash-case в camelCase в 44 module.css). **Урок: после CSS Modules миграции обязателен smoke в реальном браузере**, не только тесты.
2. **Service Worker `azarean-v2` не инвалидировался** — старые JS chunks в кеше юзера ссылались на новые class-имена → стили слетали. Bumped до `v3` (commit `0584861`). **Урок: при миграциях которые меняют hash'и всех bundle, bump CACHE_NAME обязателен.**
3. **DnD в CreateComplex/EditComplex** не сломан после миграции, но `selected-exercise / is-dragging` compound class требует ручной обработки template literals.
4. **Cross-CSS импорты:** DeleteTemplateModal/TemplateSelector/TemplateViewModal не имели своих CSS — импортируют MyComplexes.module.css как shared (там их стили жили исторически). EditTemplate.js шарит EditComplex.module.css. Это анти-паттерн который стоит вылечить позже.

### 0.5 Что осталось открытым (приоритеты до коммерческого запуска)
1. **Compliance legal position документ** — драфт под юриста. Нужен до маркетинга. Покрывает: 152-ФЗ согласие, трансграничная передача (Y360 в РФ ✓, Resend в США), право удаления (есть), at-rest шифрование (нет — отдельный вопрос).
2. **Revoke секретов опубликованных в чате** — `OPS_BOT_TOKEN`, `YANDEX_SMTP_PASSWORD`. Перед запуском с живыми пациентами.
3. **Resend signup как fallback к Y360** — низкая срочность, Y360 справляется.
4. **Hardcoded «Татьяна» cleanup** в [ContactScreen.js:148](frontend/src/pages/PatientDashboard/components/ContactScreen.js#L148) и [ProfileScreen.js:525](frontend/src/pages/PatientDashboard/components/ProfileScreen.js#L525) — после того как `/api/rehab/my/dashboard` начнёт отдавать `instructor_name`.
5. **2FA для админов** — когда появится Татьяна как админ.
6. **At-rest шифрование sensitive полей** через pgcrypto — если юрист скажет нужно.
7. **ROM CV measurement** (MediaPipe Pose, замер угла сустава по фото) — required feature, отложена.
8. **И вот это (dark theme + mobile)** — мой текущий блокер.

### 0.6 Тестовые credentials (если будешь смотреть в prod)
- **Инструктор (admin):** `vadim@azarean.com` / `Test1234`
- **Тестовый пациент:** id=14, `avi707@mail.ru` / `Test1234` (Вадим, привязан к реальному Telegram)

### 0.7 Где почитать больше
- [CLAUDE.md](CLAUDE.md) — главный source-of-truth, обновляется регулярно (стек, схема БД 20 таблиц, API endpoints, all known bugs / completed fixes)
- [SESSION_HANDOFF_2026-04-29.md](SESSION_HANDOFF_2026-04-29.md) — детально что было вчера
- [memory/MEMORY.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/MEMORY.md) — индекс auto-memory с topic-файлами (telegram_oidc_proxy, yandex_oauth_v2, email_y360_setup, ops_bot_alerts и пр.)

---

## 1. Что было сделано (Push 1-11 за сессию)

### CSS Modules миграция (Push 1-8) — РАБОТАЕТ хорошо
- 71 `.css` файл переименован в `.module.css` (включая компоненты и страницы инструктора + auth-страницы пациента)
- `frontend/src/styles/common.css` (308 строк дублей классов) удалён
- Все class names hashed → нет cross-page conflicts
- ExerciseRunner LOCKED (`.pd-runner` + `--az-*` iOS-палитра) и `pd-*` стили PatientDashboard НЕ ТРОНУТЫ
- Тесты 209/209 ✓ на каждом push'е

### Design tokens (Push 0, 9, 11) — РАБОТАЕТ технически
Файл [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css):

```css
:root {
  --color-bg: #f8fafc;        /* light bg */
  --color-surface: #ffffff;    /* card */
  --color-surface-2: #f1f5f9;  /* nested */
  --color-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --color-text-subtle: #94a3b8;
  --color-primary: #667eea;    /* instructor brand */
  ...
}

[data-theme='dark'] {
  --color-bg: #0f172a;          /* slate-900 */
  --color-surface: #1e293b;     /* slate-800 */
  --color-surface-2: #334155;   /* slate-700 */
  --color-border: #475569;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-primary: #818cf8;     /* indigo-400 */
  ...
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { /* те же overrides */ }
}
```

Bulk-replace заменил **только основные семантические цвета** в 43 module.css на токены (#667eea → var(--color-primary), #1e293b → var(--color-text), и т.д.).

### ThemeContext (Push 10) — РАБОТАЕТ функционально
- [frontend/src/context/ThemeContext.js](frontend/src/context/ThemeContext.js): state `theme: 'light' | 'dark' | 'system'`, persist в localStorage `azarean_theme`
- Обёрнут поверх AuthProvider в App.js
- [frontend/src/components/ThemeToggle.js](frontend/src/components/ThemeToggle.js): 3 кнопки (Sun/Monitor/Moon) с радио-семантикой
- Подключён в:
  - Dashboard инструктора → `headerRight`, между логотипом и кнопкой Logout
  - ProfileScreen пациента → новая секция «Внешний вид» в overlay-листе

---

## 2. Что НЕ работает визуально

### 2.1 Dark theme — white-on-white текст

**Скриншот 1 (Desktop dark, главная инструктора):**
- Hero-секция «Добро пожаловать, Вадим!» — едва видна, низкий контраст
- Карточки статистики (3 Пациентов, 2 Комплексов, 10% Выполнение, 13 Упражнений) — **белый фон, белый текст** → ничего не читается
- Блоки «Быстрые действия» (Добавить пациента / Создать комплекс / Найти упражнение) — то же самое: белый-на-белом
- Sidebar слева — нормально, контраст есть

**Корневая причина:**
- Эти блоки имеют **хардкод `background: #ffffff` или `background: white`** в CSS, который я **НЕ перевёл на `var(--color-surface)`** в Push 11.
- Bulk-replace покрыл только частично — пропустил многие места с `background: white;`, `color: #fff;`, `background-color: rgba(255,...)`.
- Нет систематического подхода — какие именно поверхности должны менять цвет в dark, а какие оставаться (например, медицинские иконки на цветной плашке могут быть всегда белыми).

### 2.2 Mobile header — ThemeToggle ломает layout

**Скриншот 2 (Mobile light, главная инструктора, ширина ~720px):**
- В header пихнуто всё подряд: Burger, Logo, **ThemeToggle (3 кнопки в pill)**, "Администратор" badge, "Выйти" кнопка
- Надпись «Azarean / Система реабилитации» **наезжает** на ThemeToggle
- Логика moжет не вмещаться на узких экранах <360px вообще

**Корневая причина:**
- ThemeToggle вставлен через `<ThemeToggle compact />` в [pages/Dashboard.js:215](frontend/src/pages/Dashboard.js#L215) inline в headerRight без какого-либо breakpoint logic
- На мобиле должен либо переехать в burger-меню, либо в footer-часть sidebar'а, либо стать одной кнопкой с popup'ом

### 2.3 Mobile light — выглядит OK на скриншоте, но это одна страница

Не проверены:
- Mobile dark mode (никто не смотрел)
- Patient dashboard (`pd-*` префикс) с переключённым data-theme — как там --pd-bg/text взаимодействуют с скриншотом приложения
- ExerciseRunner НЕ должен меняться на dark (LOCKED, iOS-палитра всегда) — это в коде сделано, но визуально проверить надо
- Notifications/toast — в dark theme выглядят OK?

---

## 3. Технические ограничения

1. **ExerciseRunner LOCKED** ([frontend/src/pages/PatientDashboard/components/ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js)) — iOS-палитра `--az-*`, дизайн-эталон 1:1. **Не трогать никогда** независимо от темы.
2. **PatientDashboard** имеет свою token-систему `--pd-*` (168 переменных в [pages/PatientDashboard/tokens.css](frontend/src/pages/PatientDashboard/tokens.css)) — её полное dark-переопределение не сделано, я в Push 9 сделал только базовые pd-bg/text. Если у пациента переключить тему — большинство `pd-*` останутся от light.
3. **Compliance disclaimer** в Profile screen упоминает медицинские данные — текст должен быть читаем в обоих режимах с явным контрастом ≥ WCAG AA.
4. **CSS Modules camelCase обязателен** — class имена в module.css должны быть camelCase (`.patientAuthContainer`, не `.patient-auth-container`), иначе `s.foo` undefined в JS. См. **урок** в commit `c8834b5`.
5. **ThemeContext API**: `useTheme()` возвращает `{ theme: 'light' | 'dark' | 'system', setTheme: (v) => void, resolvedTheme: 'light' | 'dark' }`. Использовать как угодно.

---

## 4. Что нужно от архитектора

### Минимум (must)
1. **Палитра dark theme:** какие именно cards/surfaces используют какой токен, иерархия глубины (bg → surface → surface-2 → surface-3), контрастные пары (text/bg). Нужны именно конкретные hex или формула (slate-900 → slate-800 etc.) под наш brand-purple `#667eea`.
2. **Список мест где НЕ переключать тему** (типа фирменного градиента primary→purple на login, иконок-стикеров и т.д.).
3. **Mobile layout для ThemeToggle:** где разместить (burger? отдельная кнопка-popover? footer sidebar?). Конкретный mockup или текстовая спека достаточно.

### Желательно (should)
4. **Примеры hero-секции** (`.welcomeHero` в Dashboard.module.css) и **stat-card** (тёмный шаблон ChartCard / StatCard) — два-три ключевых компонента с готовым CSS под dark.
5. **Mobile breakpoints** — на каких ширинах что меняется (header на 720 ломается, надо или скрыть label у ThemeToggle, или вообще прятать, или сделать sticky).
6. **Дизайн в Figma или скриншоты** трёх ключевых экранов в dark (Dashboard инструктора главная, PatientDashboard home, Login) — чтобы у меня был референс под который переводить.

### Nice-to-have
7. **Dark-варианты для PatientDashboard** (`--pd-*` переменные): сейчас я переопределил только pd-bg/text/card/border/text2/text3 + pd-accent-bg. Из 168 переменных — большинство остались светлые. Нужно решение: либо мапить большинство на --color-* (но pd использует свою brand-палитру `#1A8A6A` зелёный), либо отдельно проработать dark-pd.
8. **A11y контраст-чек WCAG AA** (4.5:1 для текста, 3:1 для UI-элементов) — может быть требование compliance.

---

## 5. Файлы по которым работать

### Tokens (источник правды)
- [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) — главные токены `--color-*`
- [frontend/src/pages/PatientDashboard/tokens.css](frontend/src/pages/PatientDashboard/tokens.css) — pd-* токены (для пациента)

### Сломанные в dark — проверить и переделать
- [frontend/src/pages/Dashboard.module.css](frontend/src/pages/Dashboard.module.css) — hero-секция, stat-cards, quick-actions
- [frontend/src/pages/Patients.module.css](frontend/src/pages/Patients.module.css) — карточки пациентов
- [frontend/src/pages/MyComplexes.module.css](frontend/src/pages/MyComplexes.module.css) — карточки комплексов
- [frontend/src/pages/Diagnoses.module.css](frontend/src/pages/Diagnoses.module.css), [Trash.module.css](frontend/src/pages/Trash.module.css), [Exercises/*.module.css](frontend/src/pages/Exercises/) и пр.

### Mobile responsive
- [frontend/src/pages/Dashboard.module.css](frontend/src/pages/Dashboard.module.css) — `.dashboardHeader`, `.headerLeft`, `.headerRight`
- [frontend/src/components/ThemeToggle.module.css](frontend/src/components/ThemeToggle.module.css) — сам компонент

### LOCKED (не трогать)
- `frontend/src/pages/PatientDashboard/components/ExerciseRunner.*`
- Все стили внутри `.pd-runner` scope

---

## 6. Что я могу сделать после получения брифа

- Применить любую конкретную палитру (`--color-X: #YYY`)
- Перевести любые хардкоды на токены
- Реализовать конкретный mobile-layout (если есть мокап или текстовая спека — «при <768px ThemeToggle убрать в drawer», «при <480px показывать только иконки» и т.п.)
- Добавить dark-overrides к `--pd-*` если есть готовая палитра
- Прогнать a11y check (Lighthouse) и зафиксить контраст

**НЕ могу хорошо:** проектировать визуальный язык с нуля, выбирать палитру под brand, делать иерархию глубины. Тут нужен ты.

---

## 7. Релевантные коммиты в `main`

```
c8834b5 fix(css): переименовать dash-case → camelCase в 44 module.css (КРИТИЧНО)
0584861 fix(sw): bump CACHE_NAME v2 → v3 — инвалидировать кеш после CSS Modules миграции
1979cee refactor(theme): хардкод цветов → токены design tokens (43 module.css)
152314e feat(theme): ThemeContext + переключатель в Profile/Dashboard
329a1ba feat(theme): расширить tokens.css dark-палитрой + auto prefers-color-scheme
7705759 refactor(css): components + остатки + удаление common.css
670ef06 refactor(css): Exercises страница + 6 компонентов → CSS Modules
def1a1e refactor(css): CreateComplex + EditComplex + EditTemplate → CSS Modules
b619d94 refactor(css): Patients (834 строки) → CSS Modules
2b50615 refactor(css): MyComplexes → CSS Modules + переезд .exercise-description
d7e4a95 refactor(css): Diagnoses + Trash → CSS Modules
2fdae91 refactor(css): Login + PatientAuth + Admin → CSS Modules
4e06a72 chore(css): удалить мёртвый ExercisesTemp.css
232cdc4 feat(css): добавить базовые design tokens
```

Прод: https://my.azarean.ru ([текущий main.165612b4.js + main.4fb20f45.css](https://my.azarean.ru) — стили camelCase работают)

---

## 8. Как мне присылать ответ

Любой формат:
- Готовый `tokens.css` patch — применю мгновенно.
- Скриншоты Figma + список «hero-секция: bg=#0f172a, text=#f8fafc, padding=24px» — переведу в CSS.
- Просто текст «hero не должен быть прозрачный в dark, дай ему `--color-surface`, текст `--color-text` крупным» — тоже сработает.

Главное — конкретика по поверхностям и mobile-разрешению ThemeToggle. Палитру `--color-*` могу подобрать сам по описанию (slate? zinc? gray?), но иерархию глубины (когда surface vs surface-2) лучше задай ты.
