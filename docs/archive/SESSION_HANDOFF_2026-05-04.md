# Session Handoff — 2026-05-04 (CSS Modules + Dark theme)

Бесшовный переезд в новый чат. **Удалить когда прочитан.**

## TL;DR (читать первым)

За один день (2026-05-04) сделана **большая CSS-миграция в 14 коммитов на main**:

1. **Push 1-8 (commits `232cdc4` → `7705759`)**: CSS Modules миграция — 71 `.css` → `.module.css`, удалён `common.css` с 80+ дублями. Tech debt cleanup.
2. **Push 9-11 (commits `329a1ba` → `1979cee`)**: Dark theme tokens + ThemeContext + переключатель + bulk-replace хардкодов на токены.
3. **Push 12-13 (commits `0584861` `c8834b5`)**: критические фиксы — bump SW CACHE_NAME v2→v3 + переименование dash-case→camelCase в 44 module.css (без этого `s.foo` undefined в браузере, страница без стилей).
4. **Локально применена спека архитектора** (4 файла uncommitted, 30 файлов изменено) — ещё **НЕ запушена**, ждёт визуального smoke юзера.

**Текущее состояние:** на проде стили работают (`main.165612b4.js + main.4fb20f45.css` после camelCase fix). Dark theme на проде = «наивная инверсия», архитектор раскритиковал, прислал спеку с правильной палитрой. Я применил локально + правки от юзера (упрощённый toggle Sun/Moon, ярче active nav item, PatientProgress contrast). **Тесты 209/209 ✓ + build ✓ локально.**

## ⚠️ Что нужно сделать в новом чате (приоритет)

### 1. ПЕРЕЗАПУСТИТЬ DEV-СЕРВЕРЫ (background tasks умерли вместе с сессией)

```bash
cd backend && npm run dev          # → :5000
cd frontend && PORT=3001 BROWSER=none npm start   # → :3001
```

### 2. Сказать юзеру что серверы готовы и **дождаться его smoke**

Юзер должен открыть `http://localhost:3001`, залогиниться `vadim@azarean.com / Test1234`, прокликать 5 экранов в обоих темах через ThemeToggle (солнце/луна в header). После — он скажет «push» либо пришлёт скриншоты сломанных мест.

### 3. После «push» от юзера — git add + commit + push

30 файлов uncommitted (см. ниже). Один большой commit с темой `feat(theme): применить дизайн-палитру архитектора + правки от юзера (smoke OK)`.

**НЕ ПУШИТЬ ДО SMOKE!** Архитектор прямо сказал: «Не запускай dark theme на проде до того как ты сам прошёл по 5 экранам». Юзер уже один раз увидел broken prod в этой сессии — повторно ломать нельзя.

---

## Полная картина того что произошло сегодня

### Хронология

**Утро (Push 1-11, ~5 часов):**
1. Юзер выбрал из P3 backlog'а: «CSS Modules миграция (~6-8ч) + Dark theme (~4ч)».
2. Я предложил план с 11 push'ами на main, одобрено, начал.
3. CSS Modules — переименовал `.css` → `.module.css`, заменил `className="foo"` → `className={s.foo}` через Python скрипт + ручные compound classes.
4. Dark theme — добавил `[data-theme='dark']` блок в tokens.css, ThemeContext + ThemeToggle компонент.
5. Bulk-replace hex → токены в 43 module.css.
6. **Все 11 push'ей: тесты 209/209 ✓, build ✓ на каждом коммите.**

**Полдень: юзер увидел сломанный prod**
- На скриншотах: PatientLogin/Register/Dashboard инструктора показывались **без стилей вообще** (plain HTML).
- Hard reload не помог.
- **Корневая причина (commit `c8834b5`):** CRA по умолчанию НЕ конвертирует `dash-case` в `camelCase` для CSS Modules. Class в module.css `.patient-auth-container` → доступ через `s['patient-auth-container']`, **но НЕ через `s.patientAuthContainer`** как я везде писал. → `undefined` → React рендерил `class=""` → нет стилей.
- **Тесты не поймали** потому что я мокал CSS Modules через Proxy `(_, prop) => String(prop)` — Proxy возвращал любой ключ как строку, имитируя hashed имя. В реальном браузере — undefined.
- **Фикс:** Python скрипт переименовал ВСЕ class definitions в 44 module.css из `.dash-case` в `.camelCase`. JS не трогал — там уже camelCase. После deploy — стили вернулись.

**Вечер: ревью архитектора**
- Архитектор раскритиковал три паттерна (зафиксированы в feedback memory):
  1. Слишком много в одной сессии (миграция + новая фича одновременно)
  2. 11 push'ей в main без feature-flag
  3. CSS dark theme сделана как P3-инициатива «потому что могу», никто не просил
- Прислал **конкретную дизайн-спеку**: палитра slate-indigo (4 уровня глубины `#0a0e1a → #131a2c → #1c2540 → #283156`), правила «cards → surface, inputs → surface-2, modals → surface-3», ThemeToggle на mobile спрятать в drawer/profile.
- Я применил спеку локально.

**Юзер прокликал, дал точечные правки:**
- Упростить ThemeToggle до **одной круглой кнопки Sun/Moon** (без 'system')
- Активная вкладка sidebar — как в админке VPN: яркая заливка `var(--color-primary)` + белый текст (full-fill), не приглушённый bg
- PatientProgress — имя «Вадим», заголовок «Общая статистика», цифры стат-карточек — text не виден на dark (хардкод `#1f2937`/`#111827`/etc)

Применил все три. Тесты ✓, build ✓. **НЕ запушено.**

---

## Что в файлах сейчас (uncommitted, 30 шт.)

### Ключевые файлы

**[frontend/src/styles/tokens.css](frontend/src/styles/tokens.css)** — палитра по спеке архитектора:
- Light: `--color-bg: #f8fafc`, `--color-surface: #ffffff`, `--color-text: #1e293b`, `--color-primary: #667eea`
- Dark: `--color-bg: #0a0e1a` (slate-indigo), `--color-surface: #131a2c`, `--color-surface-2: #1c2540`, `--color-surface-3: #283156`, `--color-text: #e7eaf3`, `--color-primary: #818cf8` (indigo-400, светлее для контраста)
- 4 уровня глубины + `--shadow-card`/`--shadow-modal` (глубокие в dark) + `--gradient-hero`/`--gradient-primary` (фирменные purple, не меняются)
- `prefers-color-scheme: dark` + `:root:not([data-theme])` для system fallback
- PatientDashboard `--pd-*` dark overrides (только базовые: bg/text/card/border, brand-зелёный остаётся)

**[frontend/src/components/ThemeToggle.js](frontend/src/components/ThemeToggle.js) + [.module.css](frontend/src/components/ThemeToggle.module.css)** — упрощён:
- Одна круглая кнопка 38×38px
- Иконка Sun (когда тема dark) / Moon (когда light)
- Click → переключает между light/dark
- Опция 'system' убрана из UI, но `setTheme('system')` всё ещё работает программно (default state до первого нажатия)
- prop `hideOnMobile` — на <1024px скрывается (для headerа инструктора), доступен через sidebar

**[frontend/src/pages/Dashboard.module.css](frontend/src/pages/Dashboard.module.css)** — активная вкладка:
- `.navItem.active` теперь `background: var(--color-primary); color: #ffffff;` (full-fill, как в XrayUI)
- Hover → `var(--color-primary-hover)` + box-shadow
- Иконка тоже белая через `.navItem.active .navIcon { stroke: #ffffff; color: #ffffff; }`
- Добавлен `.navThemeBlock` в нижней части sidebar — секция «Тема» с ThemeToggle (виден всегда)
- `.welcomeSection h2 color: #424750` → `var(--color-text)` (имя инструктора в hero)

**[frontend/src/pages/Dashboard.js](frontend/src/pages/Dashboard.js)** — два места:
- `<ThemeToggle hideOnMobile />` в headerRight (был `compact`, убрал — toggle и так маленький)
- `<ThemeToggle />` в самом низу `<nav>` (новая секция `.navThemeBlock`)

**[frontend/src/pages/PatientProgress.module.css](frontend/src/pages/PatientProgress.module.css)** — фикс контраста:
- Все hardcoded text (#1f2937, #111827, #374151) → `var(--color-text)`
- Muted (#475569, #4a5568) → `var(--color-text-muted)`
- Subtle (#94a3b8, #cbd5f5) → `var(--color-text-subtle)`
- Avatar plашка #eef2ff/#4f46e5 → `var(--color-primary-bg)`/`var(--color-primary)`
- Status badges (success/info/warning/danger) → семантические токены

**Bulk-replace в 22 module.css** (от спеки архитектора):
- `background: white | #fff | #ffffff` → `var(--color-surface)`
- `background: #f8fafc | #f7fafc` → `var(--color-bg)`
- `background: #f1f5f9 | #f7f8fa` → `var(--color-surface-2)`
- НЕ тронуты: gradients (Login hero, btn-primary), `color: white` на цветных кнопках, ExerciseRunner LOCKED, pd-* в PatientDashboard

**Bulk-replace text colors в 6 module.css:**
- Аналогично hardcode text → tokens

### Полный список 30 файлов
```
frontend/src/components/BackButton.module.css
frontend/src/components/Breadcrumbs.module.css
frontend/src/components/ConfirmModal.module.css
frontend/src/components/ErrorBoundary.module.css
frontend/src/components/Skeleton.module.css
frontend/src/components/ThemeToggle.js
frontend/src/components/ThemeToggle.module.css
frontend/src/components/Toast.module.css
frontend/src/pages/CreateComplex.module.css
frontend/src/pages/Dashboard.js
frontend/src/pages/Dashboard.module.css
frontend/src/pages/Diagnoses.module.css
frontend/src/pages/EditComplex.module.css
frontend/src/pages/Exercises/ExerciseDetail.module.css
frontend/src/pages/Exercises/Exercises.module.css
frontend/src/pages/Exercises/components/DeleteConfirmModal.module.css
frontend/src/pages/Exercises/components/ExerciseCard.module.css
frontend/src/pages/Exercises/components/ExerciseFilters.module.css
frontend/src/pages/Exercises/components/ExerciseModal.module.css
frontend/src/pages/Exercises/components/ExerciseSelector.module.css
frontend/src/pages/Exercises/components/ExerciseViewModal.module.css
frontend/src/pages/Login.module.css
frontend/src/pages/MyComplexes.module.css
frontend/src/pages/PatientAuth/PatientLogin.module.css
frontend/src/pages/PatientAuth/PatientRegister.module.css
frontend/src/pages/PatientDashboard/components/ProfileScreen.js
frontend/src/pages/PatientProgress.module.css
frontend/src/pages/Patients.module.css
frontend/src/pages/Trash.module.css
frontend/src/styles/tokens.css
```

---

## Уроки для будущих чатов (в memory)

Записаны как feedback в `~/.claude/projects/.../memory/`:

1. **[feedback_one_change_per_session.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_one_change_per_session.md)** — миграцию X закрыть полностью (тесты + smoke + 24ч стабильности на проде) ДО старта новой фичи Y.
2. **[feedback_no_p3_initiative.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_no_p3_initiative.md)** — перед стартом P3-задачи спрашивать «кто просил?». Для pilot-проекта с 0 пользователей выгода ≈ 0, риск регресса = 100% блокера.
3. **[feedback_smoke_real_browser.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_smoke_real_browser.md)** — после CSS / UI миграций обязательный smoke в реальном браузере. Тесты с CSS Modules моками НЕ ловят `s.foo === undefined`. Build OK тоже не ловит.
4. **[feedback_no_direct_main_push_for_ui.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_no_direct_main_push_for_ui.md)** — UI-изменения не push'ить прямо в main. Локальный smoke перед push, либо staging branch, либо feature flag.

---

## Ссылки

- **Бриф для архитектора:** [ARCHITECT_BRIEF_DARK_THEME_2026-05-01.md](ARCHITECT_BRIEF_DARK_THEME_2026-05-01.md) (содержит project context + спеку — отправлен архитектору, получен ответ применённый локально)
- **ТЗ:** [TZ_CSS_MODULES_DARK_THEME.md](TZ_CSS_MODULES_DARK_THEME.md) (изначальный план до старта работы)

## Состояние prod

```
URL: https://my.azarean.ru
Last commit: c8834b5 (camelCase fix)
main.js: main.165612b4.js
main.css: main.4fb20f45.css
SW cache: azarean-v3
```

**Стили работают.** Dark theme на проде сейчас — старая версия (наивная инверсия от Push 9, до спеки архитектора). После того как юзер скажет «push» — на проде окажется новая slate-indigo палитра + simplified ThemeToggle + active nav fill + PatientProgress contrast.

## Что после push'a (если будут вопросы юзера)

Backlog от архитектора (см. бриф 0.5):
1. **Compliance legal position документ** — драфт под юриста (≈1ч). Перед коммерческим маркетингом.
2. **Revoke секретов опубликованных в чате** — `OPS_BOT_TOKEN`, `YANDEX_SMTP_PASSWORD`. Перед запуском.
3. **Resend signup** — низкая срочность, Y360 справляется.
4. **Hardcoded «Татьяна» cleanup** — после того как `/api/rehab/my/dashboard` начнёт отдавать `instructor_name`.
5. **2FA для админов** — когда появится Татьяна.
6. **At-rest шифрование** — если юрист скажет нужно.
7. **ROM CV measurement** — required feature, отложена.

---

## Команды для быстрой ориентации в новом чате

```bash
# Запустить серверы
cd backend && npm run dev &       # → :5000
cd frontend && PORT=3001 BROWSER=none npm start &   # → :3001

# Проверить uncommitted
git status --short | grep -v "^??"  # должно быть ~30 файлов

# Проверить prod alive
curl -sI https://my.azarean.ru/api/rehab/phases?type=acl | head -3

# После «push» от юзера — один commit + push
git add -u   # (только tracked файлы — не подцепит untracked .md)
git commit -m "feat(theme): применить дизайн-палитру архитектора + правки smoke"
git push origin main

# Проверить CI
curl -sH "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/jaike077-web/azarean-rehab/actions/runs?per_page=1" \
  | python -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; \
    print(f'{r[\"status\"]} | {r[\"conclusion\"]} | {r[\"head_sha\"][:7]}')"
```

## Быстрая шпаргалка: где что

- **Тестовые credentials**: `vadim@azarean.com / Test1234` (instructor admin), `avi707@mail.ru / Test1234` (patient id=14)
- **Главный source-of-truth**: [CLAUDE.md](CLAUDE.md) (стек, схема БД 20 таблиц, API endpoints)
- **Memory index**: [.claude/projects/.../memory/MEMORY.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/MEMORY.md)
- **LOCKED не трогать**: ExerciseRunner.js (`.pd-runner` + `--az-*` iOS-палитра) и pd-* PatientDashboard стили
