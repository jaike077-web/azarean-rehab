# Azarean Rehab — v12 Implementation Plan (Session 1)

> **Для Claude Code.** Executable план, разбитый на 8 чекпоинтов. Работай строго последовательно. На каждом чекпоинте: выполни задачи → запусти проверки → закоммить → **STOP и выдай отчёт пользователю, жди явное "продолжай" перед следующим чекпоинтом**.
>
> **Design reference:** `azarean-v12-final.jsx` (прикреплённый к этой сессии файл). Он не для копипаста — это визуальный эталон. Имплементацию делаешь в существующих компонентах `frontend/src/pages/PatientDashboard/`, соблюдая актуальные правила проекта из `CLAUDE.md`.

---

## Прежде чем начать

Прочитай обязательно:
1. `CLAUDE.md` в корне — полная спецификация Azarean Rehab
2. `AZAREAN_REHAB_ARCHITECT_BRIEF.md` — актуальный брифинг, особенно разделы 8 (ключевые паттерны) и 15 (что НЕ делать)
3. `azarean-v12-final.jsx` — design reference

Убедись что помнишь и соблюдаешь:
- **Только `lucide-react`**, никогда emoji в UI
- **CommonJS** на backend, **JavaScript (не TypeScript)** на frontend
- **Только `query()` / `getClient()` из `database/db.js`**, никогда `pool` напрямую
- **API response format** — `{ data, message?, total? }`, без `success: true/false`
- **Параметризованные SQL** — всегда `$1, $2`
- **CSRF `requireSameOrigin`** на всех state-changing endpoints
- **Комментарии на русском**
- **Русские Telegram-команды — только через regex**, slash-команды только `[a-z0-9_]`
- **ExerciseRunner v4 — LOCKED, не трогать**
- **Арифметика — только через код** (SQL, `node -e`), никогда в уме

### Константы, зафиксированные пользователем перед стартом
- **Студийный телефон для WhatsApp:** `+79089049130` → URL `https://wa.me/79089049130`
- **MAX handle:** тот же что в v12 референсе (`https://max.ru/u/f9LHodD0cOI4hg2uUbj3KvRrSd4aLawyoE0EQx969NKJOXeA1Selj8x0qDc`). Вынести в конфиг, не хардкодить в компоненте.
- **Telegram бот** (для «Напоминания от Zari» виджета) — временно **существующий** `backend/services/telegramBot.js`. Реальный Zari-бот интегрируем в Сессии 3. В UI это **не афишируем**, виджет выглядит как финальный.
- **Avatar initial** в `AvatarBtn` — первая буква `patient.full_name` (или `'?'` fallback).
- **PGIC persist — Вариант B**: сохраняем в БД (`diary_entries.pgic_feel`), инструктор видит в своей админке.
- **Zari-виджет в Contact** — **оставляем** (статусный), в Profile — управление. Не дублируем, разное назначение.
- **Quick-actions в Contact** (Задать вопрос / Боль усилилась / Записаться / Отправить фото) — **визуал переносим, логику заглушаем**. `onClick={() => {}}` + `TODO:` коммент с описанием предполагаемого поведения.

### Формат отчётов на STOP-чекпоинтах
В каждом отчёте:
1. Что сделано (bullet list со ссылками на изменённые файлы)
2. Результат команд проверки (скопируй вывод)
3. Что не получилось или отклонение от плана (если есть)
4. Что нужно от пользователя перед следующим чекпоинтом (если есть)

---

## CHECKPOINT 0 — Prep & bug triage

**Цель:** подготовить ground для последующих редизайнов. Выровнять `tokens.css` с палитрой v12, создать shared UI-примитивы (без использования), исправить F5 flicker, диагностировать bug #11.

### 0.1 Сверка `tokens.css` с v12 палитрой

```bash
cat frontend/src/pages/PatientDashboard/tokens.css | grep -E "^\s*--pd-"
```

Из `azarean-v12-final.jsx` объект `C` имеет эти ключи: `teal #0D9488`, `tealDk #0F766E`, `tealMid #14B8A6`, `tealBg #F0FDFA`, `tealLt #99F6E4`, `orange #F97316`, `orangeLt #FFEDD5`, `warmPeach #FFB088`, `warmPeachDk #FF8A5C`, `ok #22C55E`, `okLt #DCFCE7`, `warn #F59E0B`, `warnLt #FEF3C7`, `err #EF4444`, `errLt #FEE2E2`, `bg #F8FAF7`, `white #FFFFFF`, `n900..n50` (9 нейтральных), `pain[11]` (DVPRS), `phase[6]`, `heroGrad`, `tg #0088CC`, `wa #25D366`, `max #FF0032`.

Для каждого из этих ключей убедись что есть эквивалент `--pd-*` в `tokens.css`. Недостающие **добавь в конец файла** с комментарием `/* v12 design tokens */`. **Не переименовывай** существующие переменные.

Предлагаемые имена (если чего-то нет):
- `--pd-color-primary`, `--pd-color-primary-dark`, `--pd-color-primary-mid`, `--pd-color-primary-bg`, `--pd-color-primary-light`
- `--pd-color-accent`, `--pd-color-accent-bg`
- `--pd-color-warm`, `--pd-color-warm-dark`
- `--pd-color-ok`, `--pd-color-ok-bg`, аналогично warn/err
- `--pd-color-hero-grad` (полный linear-gradient)
- `--pd-color-pain-0` … `--pd-color-pain-10` (11 цветов DVPRS)
- `--pd-color-phase-1` … `--pd-color-phase-6`
- `--pd-color-tg`, `--pd-color-wa`, `--pd-color-max`

### 0.2 Создай shared UI-примитивы

Новые файлы в `frontend/src/pages/PatientDashboard/components/ui/`:

1. **`AvatarBtn.js`** — портируй из v12. Prop `initial` (single char). Использует lucide-компоненты вместо inline SVG где можно, но саму «аватарку-квадратик с инициалом» сохраняет. Два варианта: `dark={false|true}` для светлого/тёмного фона.

2. **`Pill.js`** — портируй. Принимает `active`, `color` (default `var(--pd-color-primary)`), `Icon` (lucide-компонент), `onClick`, `style`, children.

3. **`Section.js`** — портируй. `{ title, Icon, children, sub }`.

4. **`ScreenHeader.js`** — новый компонент. `{ title, subtitle, onOpenProfile }` → flex-row с title/subtitle слева и `<AvatarBtn>` справа.

5. **`Switch.js`** — портируй toggle из v12 Profile.

6. **`SettingsRow.js`** — портируй. Props: `label, value, Icon, iconColor, readonly, destructive, onClick, last`.

7. **`MessengerIcons.js`** — экспорты `IcTelegram`, `IcWhatsApp`, `IcMax` (brand glyphs). Плюс конфиг:
   ```js
   export const MESSENGERS = {
     telegram: { name: "Telegram", short: "TG", color: "var(--pd-color-tg)", url: "https://t.me/azarean_studio_bot" }, // FIXME: подставить реальный бот
     whatsapp: { name: "WhatsApp", short: "WA", color: "var(--pd-color-wa)", url: "https://wa.me/79089049130" },
     max:      { name: "MAX", short: "MAX", color: "var(--pd-color-max)", url: "https://max.ru/u/f9LHodD0cOI4hg2uUbj3KvRrSd4aLawyoE0EQx969NKJOXeA1Selj8x0qDc" },
   };
   export const MESSENGER_ICONS = { telegram: IcTelegram, whatsapp: IcWhatsApp, max: IcMax };
   ```
   **Важно:** Telegram URL нужно заменить на ваш реальный TG-бот куратора. Сейчас в v12 референсе это `https://t.me/+79089049130` (это telegram-ссылка на номер, не на бот). Используй `t.me/<bot_username>` из `TELEGRAM_BOT_TOKEN` (имя бота можно узнать через `getMe`). Если на данном этапе не знаешь username бота — **STOP и спроси пользователя**, не выдумывай.

8. **`MessengerCTA.js`** — портируй полностью. Импортирует из `MessengerIcons.js`. Primary-CTA + «Другой канал» accordion с двумя остальными.

9. **`IllKnee.js`** — портируй SVG-иллюстрацию.

10. Обнови `components/ui/index.js` — добавь экспорты всех 9 компонентов.

**Внутри компонентов:** цвета беру из `var(--pd-*)`, НЕ из объекта `C`. Объект `C` — артефакт прототипа, в проде его не должно быть.

### 0.3 F5 flicker fix (bug #12)

Текущая ситуация: при обновлении `/patient-dashboard` мелькает Login пока `PatientAuthProvider` делает `getMe()`.

Найди место в `frontend/src/App.js` где рендерится `PatientAuthProvider` и `<Outlet>`. Вероятно структура такая:
```jsx
<Route element={<PatientAuthLayout/>}>
  <Route path="/patient-dashboard" element={<PatientDashboard/>}/>
  ...
</Route>
```

Если `PatientAuthLayout` возвращает `<Outlet/>` сразу, а защищённые роуты смотрят на `patient === null` как на «не залогинен» — отсюда flicker.

**Фикс:**
1. Создай `frontend/src/components/PatientSplash.js` — простой centered `<div>` с logo (можно использовать lucide `Heart` в тиловом цвете) и спиннером. **Не** Login-экран.
2. В `PatientAuthProvider` / `PatientAuthContext` есть `loading` state — если нет, добавь.
3. В `PatientAuthLayout` (или где рендерится `<Outlet/>`):
   ```jsx
   function PatientAuthLayout() {
     const { loading, patient } = usePatientAuth();
     if (loading) return <PatientSplash />;
     if (!patient) return <Navigate to="/login-patient" replace />;
     return <Outlet />;
   }
   ```
4. Убедись что `loading` становится `true` → `false` только после завершения `getMe()`.

### 0.4 Диагностика bug #11 (DiaryScreen crash)

Симптом (из CLAUDE.md, раздел «Открытые баги»):
> DiaryScreen crash: `TypeError: Cannot convert undefined or null to object at entries` при клике. Stack trace указывает на ContactScreen.js:552 — возможно bundler source map issue.

Диагностический протокол:

```bash
# 1. Найти все Object.entries в обоих файлах и соседних
grep -rn "Object\.entries" frontend/src/pages/PatientDashboard/components/

# 2. Production build, чтобы source maps были честные
cd frontend && npm run build 2>&1 | tail -30

# 3. Запустить dev-сервер и воспроизвести
# (делать вручную не будем — важно само наличие неохраняемых Object.entries)
```

Для каждого найденного `Object.entries(x)`:
- Проверь что `x` не может быть `null` / `undefined`
- Если может — оберни `Object.entries(x || {})` **или** `if (!x) return null` в начале рендера

Наиболее подозрительные места:
- `DiaryScreen.js` — где рендерится форма дневника с динамическими полями
- `ContactScreen.js:552` — где-то в конце файла, вероятно в list-rendering секции (quick-actions? messages?)
- Компоненты-соседи которые могут быть случайно подгружены webpack chunk'ом

**Не исправляй угадыванием.** Найди корневую причину, опиши её в отчёте. Исправляй в рамках отдельного коммита внутри этого checkpoint'а, с сообщением `fix(patient): DiaryScreen crash on Object.entries null guard`.

Если не удаётся воспроизвести bug или найти причину — **STOP и отчёт**, не делай мнимый фикс.

### 0.5 Verifiable checks

```bash
# Backend тесты
cd backend && npm test 2>&1 | tail -15

# Frontend тесты
cd frontend && npm test -- --watchAll=false 2>&1 | tail -20

# ESLint — не должно быть новых warnings
cd frontend && npx eslint src/pages/PatientDashboard/components/ui/ 2>&1 | tail -10

# Bundle size проверка — опционально
cd frontend && ls -la build/static/js/*.js 2>/dev/null | head -5
```

### 0.6 Commits & STOP

Коммиты внутри checkpoint'а (по одному на каждую логическую единицу):
1. `chore(patient): extend tokens.css with v12 design tokens`
2. `feat(patient): add shared UI primitives (AvatarBtn, Pill, Section, ScreenHeader, Switch, SettingsRow, MessengerIcons, MessengerCTA, IllKnee)`
3. `fix(patient): prevent F5 login flicker with PatientSplash`
4. `fix(patient): <описание корневой причины bug #11>` (если исправил)

**STOP ↓**

В отчёте пользователю обязательно укажи:
- Какие новые `--pd-*` переменные добавлены
- Как назвал Telegram URL (и использовал ли реальный username бота — если не нашёл, спроси)
- Причину bug #11 (если нашёл) или что пробовал (если не нашёл)
- Результат всех 4 команд проверки

Жди явное «продолжай».

---

## CHECKPOINT 1 — Profile overlay

**Цель:** заменить табовый ProfileScreen на overlay с avatar-навигацией. Бэкенд **не трогаем**, только frontend. Messenger picker в Profile показывается disabled (будет в Checkpoint 3).

### 1.1 PatientDashboard: 6 табов → 5 + profileOpen state

```bash
# Найти где определён массив табов
grep -n "activeTab\|ProfileScreen\|screens" frontend/src/pages/PatientDashboard/PatientDashboard.js
```

В `PatientDashboard.js`:
- Удали `ProfileScreen` из массива экранов/табов
- Добавь `const [profileOpen, setProfileOpen] = useState(false)`
- Добавь `onOpenProfile={() => setProfileOpen(true)}` как prop для каждого из 5 оставшихся экранов
- Добавь `{profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)}/>}` в конце JSX

В `components/ui/TabBar.js` (или где оно хранится) — проверь что табов 5, не 6. Хардкод числа табов недопустим — должно браться из массива.

### 1.2 Redesign ProfileScreen.js

Перепиши `components/ProfileScreen.js` по v12-референсу (функция `Profile` в `azarean-v12-final.jsx`, L383-725). Ключевые блоки:

1. **Header** — кнопка-назад + «Профиль» заголовок
2. **Identity block** — gradient-card с 72×72 аватаром (initial из `patient.full_name[0]`), кнопка камеры для upload, имя, email (small), diagnosis chip
3. **Личное** — SettingsRow'ы: Имя (edit), Email (readonly), Телефон (edit), Дата рождения (readonly)
4. **Реабилитация** — SettingsRow'ы: Диагноз (readonly, `var(--pd-color-primary)` icon), Дата операции (readonly), Куратор (tap → закрывает overlay и переходит на Contact). + caption «Диагноз и дата операции редактируются только куратором»
5. **Связь** — две карточки:
   - «Основной канал связи» — **disabled** в этом checkpoint'е (placeholder + hint «Скоро»)
   - «Напоминания от Zari» — полный функционал Telegram-привязки из **существующего** ProfileScreen (переноси как есть, не переписывая)
6. **Безопасность** — SettingsRow «Сменить пароль» (ведёт на существующую `/patient/change-password` страницу или открывает modal — что было)
7. **Прочее** — О приложении / Помощь / Выйти (destructive)
8. **Версия в футере**
9. **Edit modal** — bottom-sheet для name/phone, как в v12

**Важно:**
- `email`, `birth_date`, `diagnosis`, `surgery_date` — **read-only**, НЕ рендерятся как `<input>`
- Edit modal открывается только для `name` и `phone`
- При Save → `PUT /api/patient-auth/me` через `patientApi` axios
- Все цвета — `var(--pd-*)`, **не** хардкод

### 1.3 Интеграция с PatientAuthContext

Profile читает `patient` из `usePatientAuth()`. При успешном сохранении name/phone — обнови локальный state `patient`. Если context умеет сам — вызывай его метод обновления. Если нет — после `PUT /me` сделай `getMe()` заново.

### 1.4 AvatarBtn на 5 экранах

В каждом из 5 компонентов (`HomeScreen`, `RoadmapScreen`, `ExercisesScreen`, `DiaryScreen`, `ContactScreen`) добавь `<AvatarBtn initial={patient.full_name[0]} onClick={onOpenProfile}/>` в header.

Для первого подхода — добавь **минимально инвазивно**, не ломая текущую раскладку экрана. Full redesign каждого экрана — в следующих checkpoint'ах. Здесь задача: чтобы аватар появился и открывал Profile.

**ExerciseRunner НЕ трогаем.** Аватар добавляется только на `ExercisesScreen` (list view), не внутрь runner'а.

### 1.5 PUT /api/patient-auth/me allowlist

Проверь что эндпоинт принимает `full_name` и `phone` и **игнорирует** попытки обновить `email`, `birth_date`, `diagnosis`.

```bash
grep -n "allowed\|PUT.*/me\|router.put" backend/routes/patientAuth.js
```

Если allowlist уже есть и содержит `full_name` + `phone` — **ничего не трогай**. Если нет — добавь, строго:
```js
const ALLOWED = ['full_name', 'phone'];
const updates = {};
for (const key of ALLOWED) {
  if (key in req.body) updates[key] = req.body[key];
}
if (Object.keys(updates).length === 0) {
  return res.status(400).json({ error: 'NO_FIELDS', message: 'Нет полей для обновления' });
}
// Строим динамический UPDATE через параметризованный запрос
```

Никогда не делай `UPDATE patients SET ${keys} = ${values}` через string interpolation.

### 1.6 Тесты

Добавь в `frontend/src/pages/PatientDashboard/components/ProfileScreen.test.js`:

```js
describe('ProfileScreen', () => {
  it('renders identity block with initial', () => { ... });
  it('opens edit modal on name tap', () => { ... });
  it('saves name via PUT /me and updates context', async () => { ... });
  it('does NOT render email as input (readonly)', () => { ... });
  it('does NOT render diagnosis as input (readonly)', () => { ... });
  it('clicking Curator closes overlay and navigates to Contact', () => { ... });
});
```

Бэкенд: если менял allowlist, добавь в `backend/tests/__tests__/patientProfile.test.js`:

```js
it('PUT /me ignores email field even if sent', async () => {
  const res = await request(app).put('/api/patient-auth/me')
    .set('Cookie', [patientCookie])
    .send({ full_name: 'Новое Имя', email: 'hacker@evil.com' });
  expect(res.status).toBe(200);
  // проверь в БД что email НЕ изменился
});
it('PUT /me ignores diagnosis field', async () => { ... });
```

### 1.7 Checks

```bash
cd backend && npm test 2>&1 | tail -15
cd frontend && npm test -- --watchAll=false 2>&1 | tail -20

# Smoke-тест через curl (если backend запущен локально)
# Залогинься вручную и достань cookie, потом:
# curl -X PUT http://localhost:5000/api/patient-auth/me \
#   -H "Content-Type: application/json" \
#   -H "Cookie: patient_access_token=..." \
#   -d '{"full_name":"Test","email":"evil@x.com"}'
# → должно вернуть 200 и в БД email НЕ измениться
```

### 1.8 Commits & STOP

1. `feat(patient): convert tab-ProfileScreen to overlay with avatar navigation`
2. `feat(patient): redesign ProfileScreen per v12 (identity + sections)`
3. `fix(patient): PUT /me strict allowlist (full_name, phone only)` — если правил
4. `test(patient): ProfileScreen + PUT /me allowlist coverage`

**STOP ↓**

В отчёте:
- Работает ли avatar-навигация на всех 5 экранах
- Логика Cancel / ESC / tap вне modal'а для Edit-окна
- Что сделал с Telegram-URL в MESSENGERS (какой bot username)
- Результаты тестов

---

## CHECKPOINT 2 — Backend: multi-channel messenger + feedback link

**Цель:** миграция БД + API-поддержка для `preferred_messenger` и `linked_diary_id`. Frontend в этом checkpoint'е НЕ использует новые поля — изменений в UI нет.

### 2.1 Миграция

Создай `backend/database/migrations/20260418_patient_preferred_messenger.sql`:

```sql
-- Канал связи пациента (multi-channel support)
ALTER TABLE patients
  ADD COLUMN preferred_messenger VARCHAR(20) NOT NULL DEFAULT 'telegram'
  CHECK (preferred_messenger IN ('telegram', 'whatsapp', 'max'));

CREATE INDEX idx_patients_preferred_messenger
  ON patients(preferred_messenger)
  WHERE is_active = true;

-- Связь ответа куратора с записью дневника (feedback card)
ALTER TABLE messages
  ADD COLUMN linked_diary_id INTEGER
    REFERENCES diary_entries(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN channel VARCHAR(20) NULL
    CHECK (channel IN ('telegram', 'whatsapp', 'max', 'in_app') OR channel IS NULL);

CREATE INDEX idx_messages_linked_diary_id
  ON messages(linked_diary_id)
  WHERE linked_diary_id IS NOT NULL;
```

Rollback (сохрани как коммент в PR, не в код):
```sql
DROP INDEX IF EXISTS idx_messages_linked_diary_id;
ALTER TABLE messages DROP COLUMN IF EXISTS channel;
ALTER TABLE messages DROP COLUMN IF EXISTS linked_diary_id;
DROP INDEX IF EXISTS idx_patients_preferred_messenger;
ALTER TABLE patients DROP COLUMN IF EXISTS preferred_messenger;
```

Примени миграцию:
```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260418_patient_preferred_messenger.sql
```

Проверь что применилось:
```bash
psql -U postgres -d azarean_rehab -c "\d patients" | grep preferred
psql -U postgres -d azarean_rehab -c "\d messages" | grep -E "linked_diary_id|channel"
```

### 2.2 GET /api/patient-auth/me

```bash
grep -n "SELECT.*patients\|FROM patients" backend/routes/patientAuth.js | head -10
```

Найди GET /me (или `/api/patient-auth/me`). Расширь SELECT allowlist добавив `preferred_messenger`:

```js
const result = await query(`
  SELECT id, full_name, email, phone, birth_date, diagnosis,
         avatar_url, telegram_chat_id, preferred_messenger,
         auth_provider, email_verified,
         last_login_at, created_at, updated_at
  FROM patients WHERE id = $1 AND is_active = true
`, [req.patient.id]);
```

**Не добавляй `password_hash`, `failed_login_attempts`, `locked_until`** — это закрытая уязвимость из CLAUDE.md, никогда не утекаем.

### 2.3 PUT /api/patient-auth/me

Расширь allowlist:

```js
const ALLOWED = ['full_name', 'phone', 'preferred_messenger'];

// Валидация preferred_messenger
if ('preferred_messenger' in req.body) {
  const valid = ['telegram', 'whatsapp', 'max'];
  if (!valid.includes(req.body.preferred_messenger)) {
    return res.status(400).json({
      error: 'INVALID_MESSENGER',
      message: 'Недопустимое значение канала связи'
    });
  }
}
```

### 2.4 GET /api/rehab/my/messages

Добавь в SELECT:

```bash
grep -n "my/messages\|FROM messages" backend/routes/rehab.js | head -10
```

```js
SELECT id, sender_id, content, created_at, is_read,
       linked_diary_id, channel
FROM messages
WHERE patient_id = $1
ORDER BY created_at DESC
LIMIT $2;
```

Если sender_id без FK (технический долг из бриф #10) — **не чиним в этом checkpoint'е**.

### 2.5 Тесты backend

Добавь в `backend/tests/__tests__/patientProfile.test.js`:

```js
describe('preferred_messenger', () => {
  it('defaults to telegram for new patients', async () => {
    // проверь что pacient из БД имеет preferred_messenger='telegram'
  });

  it('GET /me returns preferred_messenger', async () => {
    const res = await request(app).get('/api/patient-auth/me')
      .set('Cookie', [patientCookie]);
    expect(res.body.data.preferred_messenger).toBe('telegram');
  });

  it('PUT /me updates to whatsapp', async () => {
    const res = await request(app).put('/api/patient-auth/me')
      .set('Cookie', [patientCookie])
      .send({ preferred_messenger: 'whatsapp' });
    expect(res.status).toBe(200);
    const check = await request(app).get('/api/patient-auth/me').set('Cookie', [patientCookie]);
    expect(check.body.data.preferred_messenger).toBe('whatsapp');
  });

  it('PUT /me rejects invalid messenger', async () => {
    const res = await request(app).put('/api/patient-auth/me')
      .set('Cookie', [patientCookie])
      .send({ preferred_messenger: 'skype' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_MESSENGER');
  });
});
```

В `backend/tests/__tests__/rehab.routes.test.js` — проверка что `GET /my/messages` возвращает `linked_diary_id` и `channel`.

### 2.6 Обновление CLAUDE.md

В секции БД `patients` добавь строку:
```
telegram_chat_id BIGINT UNIQUE,
preferred_messenger VARCHAR(20) NOT NULL DEFAULT 'telegram' CHECK (...)
```

В секции `messages`:
```
+linked_diary_id INT REFERENCES diary_entries(id) ON DELETE SET NULL
+channel VARCHAR(20) CHECK (...)
```

В секции «Миграции» добавь `20260418_patient_preferred_messenger.sql` в список.

### 2.7 Checks

```bash
cd backend && npm test 2>&1 | tail -20

# Ручная проверка колонок
psql -U postgres -d azarean_rehab -c "\d patients" | grep -E "preferred"
psql -U postgres -d azarean_rehab -c "\d messages" | grep -E "linked|channel"

# Проверка что старые пациенты получили default
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM patients WHERE preferred_messenger IS NULL;"
# должно быть 0
```

### 2.8 Commits & STOP

1. `feat(backend): migrate patients.preferred_messenger + messages.linked_diary_id`
2. `feat(backend): extend /patient-auth/me with preferred_messenger`
3. `feat(backend): extend /rehab/my/messages with linked_diary_id+channel`
4. `docs: update CLAUDE.md with new schema columns`
5. `test(backend): preferred_messenger validation coverage`

**STOP ↓**

В отчёте: результат `\d` команд, число пациентов с дефолтом, pass/fail всех бэкенд-тестов.

---

## CHECKPOINT 3 — Frontend: wire multi-channel to API

**Цель:** подключить Profile messenger picker к API, использовать `preferred_messenger` в `MessengerCTA`. В Contact/Diary пока не используется (их редизайним позже).

### 3.1 PatientAuthContext расширение

Файл: `frontend/src/context/PatientAuthContext.js`.

Убедись что объект `patient` после `getMe()` содержит `preferred_messenger`. Скорее всего он уже берётся «как есть» из response — просто убедись.

Добавь функцию обновления, если её нет:

```js
const updatePatient = async (partial) => {
  const res = await patientApi.put('/patient-auth/me', partial);
  setPatient(res.data);  // response unwrap через interceptor
  return res.data;
};

return <PatientAuthContext.Provider value={{ patient, loading, login, logout, updatePatient }}>
```

### 3.2 Profile: enable messenger picker

В `ProfileScreen.js` (из Checkpoint 1) — убери disabled-state из «Основной канал связи». Реализуй accordion по v12:

```jsx
<div>
  <SettingsRow
    label="Основной канал связи"
    value={MESSENGERS[patient.preferred_messenger].name}
    Icon={MESSENGER_ICONS[patient.preferred_messenger]}
    iconColor={MESSENGERS[patient.preferred_messenger].color}
    onClick={() => setShowMessengerPicker(!showMessengerPicker)}
  />
  {showMessengerPicker && (
    <div style={{ display:"flex", gap:8, padding:"12px 0" }}>
      {Object.keys(MESSENGERS).map(key => (
        <button key={key} onClick={() => handleMessengerChange(key)}
          className={`pd-messenger-card ${patient.preferred_messenger === key ? 'pd-messenger-card--active' : ''}`}>
          <MessengerIcon.../>
          {MESSENGERS[key].name}
        </button>
      ))}
    </div>
  )}
</div>
```

`handleMessengerChange`:
```js
const handleMessengerChange = async (key) => {
  if (key === patient.preferred_messenger) return;  // no-op

  const prev = patient.preferred_messenger;
  // Оптимистичный update UI
  setPatient({ ...patient, preferred_messenger: key });
  try {
    await updatePatient({ preferred_messenger: key });
    toast.success('Канал связи изменён');
  } catch (err) {
    // Rollback
    setPatient({ ...patient, preferred_messenger: prev });
    toast.error('Не удалось сохранить. Попробуйте ещё раз.');
  }
};
```

Стили messenger-карточек добавь в `PatientDashboard.css` с prefix `pd-`, используй `var(--pd-*)` для цветов.

### 3.3 MessengerCTA: default primary

Проверь что `MessengerCTA` уже принимает `primary` как prop (он принимает — из Checkpoint 0). В точках вызова будет передаваться `patient.preferred_messenger`, но в Checkpoint 3 нет ещё точек вызова (они появятся в checkpoints 5, 6, 7 при редизайне Contact/Diary).

Тем не менее — добавь один usage **в секцию Профиля** для демонстрации, что всё работает end-to-end:

В блоке Profile после Identity block можно добавить кнопку «Связаться с куратором сейчас» со `<MessengerCTA primary={patient.preferred_messenger}/>`. Это полезно ещё и как UX-пункт: если пациент в Профиле, он может быстро написать Татьяне.

### 3.4 Тесты

В `ProfileScreen.test.js` добавь:

```js
it('opens messenger picker accordion on tap', () => { ... });
it('changes preferred_messenger optimistically + API', async () => { ... });
it('rolls back on API failure + toast error', async () => { ... });
it('MessengerCTA renders with patient preferred messenger', () => { ... });
```

Mock `patientApi.put` через jest.mock.

### 3.5 Checks

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -20
```

Ручная проверка через dev: открой Profile → смени канал → обнови страницу → значение сохранилось.

### 3.6 Commits & STOP

1. `feat(patient): wire ProfileScreen messenger picker to /me API`
2. `feat(patient): MessengerCTA usage in ProfileScreen demo block`
3. `test(patient): messenger picker optimistic update + rollback`

**STOP ↓**

В отчёте: работает ли сохранение, работает ли rollback на имитированной ошибке (можно временно в dev выкинуть exception из `updatePatient`), что в consoles.

---

## CHECKPOINT 4 — Home redesign

**Цель:** `HomeScreen.js` → визуал v12. PGIC клиентский state + sync с DiaryScreen добавим в Checkpoint 6 (Diary) через миграцию `pgic_feel`.

В этом checkpoint'е PGIC-тапы **локальны** (React state в PatientDashboard), ещё без БД persist. Persist добавится в Checkpoint 6.

### 4.1 PatientDashboard: lift PGIC state

```js
const [pgicFeel, setPgicFeel] = useState(null);

<HomeScreen
  onOpenProfile={...}
  pgicFeel={pgicFeel}
  onSetPgicFeel={setPgicFeel}
  goTab={setActiveTab}
  allDone={allDone}
  patient={patient}
/>
<DiaryScreen
  onOpenProfile={...}
  pgicFeel={pgicFeel}  {/* читает для pre-population */}
  .../>
```

### 4.2 Redesign HomeScreen.js

Полностью перепиши `components/HomeScreen.js` по v12-референсу (функция `Home`, L740-944 в v12 файле). Структура:

1. Greeting row — приветствие по времени (`Доброе утро/день/вечер` + `patient.full_name`) + `<AvatarBtn>`
2. Hero block — gradient, specialist chip (tap → `goTab(4)` Contact), IllKnee, условный рендер CTA по `allDone`:
   - `false` → «Сегодня · ПКС — Фаза 1 · 2 упражнения · ~15 мин» + белая кнопка «Начать» → `goTab(2)`
   - `true` → «Готово · Комплекс завершён» + «Заполнить дневник» → `goTab(3)`
3. PGIC card — «Как вы сейчас?» + 3 кнопки (Лучше/Так же/Хуже), обновляет `pgicFeel` через `onSetPgicFeel`. Если feel выбран — показывается «Подробнее» → `goTab(3)` Diary.
4. Next visit card — hardcoded в v12, нужен реальный источник. Посмотри `GET /api/rehab/my/dashboard` — возможно там есть `next_visit`. Если нет — скрой карточку graceful (не рендери).
5. Phase progress block — Ring 83% + stats (Боль/Отёк/Дней). Данные из `GET /api/rehab/my/dashboard`.
6. Daily tip — «Перед упражнениями прогрейте мышцы 3–5 минут...». Из `GET /api/rehab/tips` с фильтром по текущей фазе. Если нет — hardcode один.

**Цвета все `var(--pd-*)`.** Специально проверь что hero-градиент использует `var(--pd-color-hero-grad)`.

### 4.3 Стили

`PatientDashboard.css` — добавь prefix-классы для новых блоков. Избегай дубликатов с существующими.

### 4.4 Тесты

```js
describe('HomeScreen', () => {
  it('renders greeting based on time', () => { ... });
  it('shows "Начать" button when allDone=false', () => { ... });
  it('shows "Заполнить дневник" when allDone=true', () => { ... });
  it('PGIC tap updates parent state', () => { ... });
  it('specialist chip navigates to Contact tab', () => { ... });
  it('hides next visit if API returned null', () => { ... });
});
```

### 4.5 Checks

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -20
```

Ручная проверка на 4 размерах экранов (DevTools): 375, 393, 430, 768px.

### 4.6 Commits & STOP

1. `feat(patient): lift pgicFeel state in PatientDashboard`
2. `feat(patient): HomeScreen redesign per v12 (hero + PGIC + phase + tip)`
3. `test(patient): HomeScreen interaction + responsive`

**STOP ↓**

В отчёте: скриншоты на всех ширинах (или словесное описание), что из данных приходит из API / hardcoded, работает ли PGIC→Diary передача (тапни на Home, открой Diary — должен ли слайдер встать на 2/4/6).

---

## CHECKPOINT 5 — Contact redesign

**Цель:** `ContactScreen.js` → v12 `Contact`. Messenger picker **убран** (он в Profile). Feedback card использует `linked_diary_id`. Zari widget **оставлен** (статусный).

### 5.1 Redesign ContactScreen.js

Перепиши по v12 (функция `Contact`, L1931-2073). Блоки:

1. Header + `<AvatarBtn>`
2. Specialist feedback card — аватар Т, время последнего сообщения, контент, chip «К записи N апреля» если `linked_diary_id`, unread-badge справа. + `<MessengerCTA primary={patient.preferred_messenger} label="Ответить"/>`
3. Studio location card — Белинского 108, ст. 26, Екатеринбург (hardcoded — это ваш единственный филиал)
4. Emergency block — 103 + Azarean tel:+79089049130
5. Quick actions list — 4 кнопки, **onClick заглушки** с TODO:
   ```jsx
   <button onClick={() => { /* TODO: открыть форму свободного вопроса → отправить через preferred_messenger */ }}>
     Задать вопрос
   </button>
   ```
6. Zari notifications widget — статус Telegram, 4 переключателя (Утро/Вечер/Совет дня/Смена фазы). **Но управление** — в Profile. Здесь — **read-only** отображение текущих настроек.

### 5.2 API для feedback card

```bash
grep -n "my/messages\|useMessages" frontend/src/pages/PatientDashboard/components/ContactScreen.js
```

Используй существующий `GET /api/rehab/my/messages`. Возьми последнее сообщение от инструктора (sender_id !== patient_id):

```js
const [lastFeedback, setLastFeedback] = useState(null);
const [unreadCount, setUnreadCount] = useState(0);

useEffect(() => {
  patientApi.get('/rehab/my/messages?limit=10').then(res => {
    const msgs = res.data || [];
    const fromInstructor = msgs.filter(m => m.sender_id !== patient.id);
    setLastFeedback(fromInstructor[0] || null);
    setUnreadCount(fromInstructor.filter(m => !m.is_read).length);
  });
}, []);
```

Если у pacient'а нет feedback'ов — блок показывает заглушку «Пока нет сообщений от куратора».

### 5.3 Linked diary chip

Если `lastFeedback.linked_diary_id` → chip «К записи 11 апреля» (отформатируй `diary_entries.entry_date` по `linked_diary_id`). Для этого нужен дополнительный GET, ИЛИ сделай JOIN на backend:

```js
// в backend/routes/rehab.js GET /my/messages
SELECT m.id, m.sender_id, m.content, m.created_at, m.is_read,
       m.linked_diary_id, m.channel,
       de.entry_date AS linked_diary_date
FROM messages m
LEFT JOIN diary_entries de ON de.id = m.linked_diary_id
WHERE m.patient_id = $1
ORDER BY m.created_at DESC
LIMIT $2;
```

**Важно:** `de.entry_date::text AS linked_diary_date` — для JSON timezone safety (правило проекта).

### 5.4 Zari widget — read-only

Статус Telegram берём из `patient.telegram_chat_id !== null`.
Настройки напоминаний — из `GET /api/rehab/my/notifications`.
Switch'и в Contact — **disabled** (`<Switch on={setting.enabled} onTap={null}/>` или стиль grayed out), с подписью «Настроить — в Профиле» и link-arrow на Profile.

### 5.5 Тесты

```js
it('renders last instructor message', () => { ... });
it('renders linked diary chip if linked_diary_id present', () => { ... });
it('hides feedback block if no messages', () => { ... });
it('Zari widget is read-only with link to Profile', () => { ... });
it('Emergency tel: links are clickable', () => { ... });
```

### 5.6 Checks

```bash
cd backend && npm test 2>&1 | tail -10
cd frontend && npm test -- --watchAll=false 2>&1 | tail -15
```

### 5.7 Commits & STOP

1. `feat(backend): join linked_diary_date in /my/messages`
2. `feat(patient): ContactScreen redesign per v12 (feedback-only + read-only Zari)`
3. `test(patient): Contact feedback card + linked diary`

**STOP ↓**

---

## CHECKPOINT 6 — Diary redesign + structured fields + photo upload

**Цель:** `DiaryScreen.js` → v12 `Diary`. Миграция structured fields + `pgic_feel`. Photo upload. Sparkline trend. Fix bug #6 (сериализация в notes).

Это **самый большой checkpoint** — примерно 5–7 часов работы.

### 6.1 Миграция

`backend/database/migrations/20260419_diary_structured_fields.sql`:

```sql
-- Структурные поля дневника (вместо сериализации в notes)
ALTER TABLE diary_entries
  ADD COLUMN pgic_feel VARCHAR(10) CHECK (pgic_feel IN ('better','same','worse') OR pgic_feel IS NULL),
  ADD COLUMN rom_degrees INTEGER CHECK (rom_degrees >= 0 AND rom_degrees <= 180),
  ADD COLUMN better_list JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN pain_when VARCHAR(20) CHECK (pain_when IN ('morning','day','evening','exercise','walking') OR pain_when IS NULL);

-- Отдельная таблица для фото
CREATE TABLE diary_photos (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_diary_photos_entry ON diary_photos(diary_entry_id);

-- Лимит 3 фото на запись (enforcement на backend, для подстраховки)
-- Без триггера, проверка в application-слое
```

Rollback:
```sql
DROP INDEX IF EXISTS idx_diary_photos_entry;
DROP TABLE IF EXISTS diary_photos;
ALTER TABLE diary_entries
  DROP COLUMN IF EXISTS pain_when,
  DROP COLUMN IF EXISTS better_list,
  DROP COLUMN IF EXISTS rom_degrees,
  DROP COLUMN IF EXISTS pgic_feel;
```

Примени:
```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260419_diary_structured_fields.sql
```

### 6.2 Backend: POST /my/diary с новыми полями

```bash
grep -n "POST.*diary\|router.post.*/my/diary" backend/routes/rehab.js
```

Расширь endpoint чтобы принимал `pgic_feel`, `rom_degrees`, `better_list`, `pain_when` + уже существующие `pain_level`, `swelling`, `mobility`, `mood`, `sleep_quality`, `exercises_done`, `notes`.

Валидация:
- `pgic_feel`: enum / null
- `rom_degrees`: integer 0-180 / null
- `better_list`: array of strings (whitelist: `['ext','walk','sleep','mood']`)
- `pain_when`: enum / null

UPSERT по `(patient_id, entry_date)` — уже должен быть, сохрани его.

### 6.3 Backend: GET /my/diary/trend

Новый endpoint:

```js
router.get('/my/diary/trend', authenticatePatient, async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 14, 90);  // max 90
  const result = await query(`
    SELECT entry_date::text AS date, pain_level AS pain
    FROM diary_entries
    WHERE patient_id = $1
      AND entry_date > CURRENT_DATE - INTERVAL '1 day' * $2
    ORDER BY entry_date ASC
  `, [req.patient.id, days]);
  res.json({ data: result.rows });
});
```

### 6.4 Backend: photo upload endpoints

```js
// POST /api/rehab/my/diary/:entry_id/photos
router.post('/my/diary/:entry_id/photos', authenticatePatient, requireSameOrigin, upload.single('photo'), async (req, res) => {
  const entryId = parseInt(req.params.entry_id);
  if (isNaN(entryId)) return res.status(400).json({ error: 'BAD_ID', message: '...' });

  // Проверка ownership
  const entry = await query('SELECT patient_id FROM diary_entries WHERE id = $1', [entryId]);
  if (entry.rows.length === 0 || entry.rows[0].patient_id !== req.patient.id) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Запись не найдена' });
  }

  // Проверка лимита 3
  const countResult = await query('SELECT COUNT(*)::int AS n FROM diary_photos WHERE diary_entry_id = $1', [entryId]);
  if (countResult.rows[0].n >= 3) {
    return res.status(400).json({ error: 'LIMIT', message: 'Максимум 3 фото на запись' });
  }

  // Обработка через sharp (как аватары)
  const processed = await sharp(req.file.buffer)
    .resize(1200, 1200, { fit: 'inside' })
    .jpeg({ quality: 82 })
    .toBuffer();

  // Сохранить на диск
  const filename = `diary_${entryId}_${Date.now()}.jpg`;
  const filePath = `/uploads/diary_photos/${filename}`;
  await fs.writeFile(`backend${filePath}`, processed);

  const insertResult = await query(`
    INSERT INTO diary_photos (diary_entry_id, file_path, file_size_bytes)
    VALUES ($1, $2, $3) RETURNING id, file_path, created_at
  `, [entryId, filePath, processed.length]);

  res.json({ data: insertResult.rows[0] });
});

// DELETE /api/rehab/my/diary/:entry_id/photos/:photo_id — аналогично с ownership check
// GET /api/rehab/my/diary/:entry_id/photos/:photo_id — отдать файл blob'ом, как аватары
```

### 6.5 Backend: расширь GET /my/diary чтобы возвращал photos[]

```js
SELECT d.*, COALESCE(
  (SELECT json_agg(json_build_object('id', dp.id, 'created_at', dp.created_at))
   FROM diary_photos dp WHERE dp.diary_entry_id = d.id),
  '[]'
) AS photos
FROM diary_entries d
WHERE patient_id = $1 AND entry_date = $2;
```

### 6.6 Frontend: DiaryScreen redesign

Перепиши `DiaryScreen.js` по v12 `Diary` (L1633-1929). Блоки:

1. Header — «Дневник» + сохранено-badge + `<AvatarBtn>`
2. PGIC info-bar — если `pgicFeel !== null` AND нет сегодняшней записи: «Данные подставлены из отметки "Лучше" на Главной». Initial pain 2/4/6.
3. Feedback card — если есть `messages WHERE linked_diary_id = current_entry.id AND sender=instructor`
4. Pain slider + pain_when pills
5. Swelling pills
6. ROM input с ±1° кнопками (60-180°)
7. Photos grid (3 max) — upload через `<input type="file" accept="image/*">` скрытый, button triggers click. Показывай preview (blob URL).
8. «Что стало лучше» pills → `better_list`
9. Notes textarea
10. `<MessengerCTA primary={patient.preferred_messenger} label="Отправить отчёт"/>`
11. Sparkline trend — `<svg>` с 14-day данными из `GET /my/diary/trend`
12. History list — список предыдущих записей (из `GET /my/diary` без date)

### 6.7 Bug #6 — убрать сериализацию

Найди в текущем `DiaryScreen.js` места где данные парсятся из `notes`:

```bash
grep -n "notes\.split\|JSON\.parse.*notes\|notes.*regex" frontend/src/pages/PatientDashboard/components/DiaryScreen.js
```

Все такие места — замени на чтение из соответствующих колонок (`pgic_feel`, `rom_degrees`, `better_list`, `pain_when`). `notes` остаётся только для свободного текста.

### 6.8 PGIC persist

При каждом PGIC тапе на Home → автоматически `POST /my/diary` с `{ pgic_feel, entry_date: today }`. Это создаст/обновит сегодняшнюю запись даже если пациент ещё не открыл Diary. Возможно, перенести этот endpoint в Home-компонент, а не только в Diary.

**Вариант проще:** при первом открытии Diary после PGIC тапа — создаёт запись автоматически с `pgic_feel` и default'ами. Более агрессивный вариант UX, но меньше edge-кейсов.

Реши как проще, задокументируй выбор в комментах кода.

### 6.9 Bug #11 — проверка после редизайна

После full rewrite'а `DiaryScreen.js` — снова запусти prod build:

```bash
cd frontend && npm run build 2>&1 | tail -10
```

И проверь что нет warning'ов на `Object.entries`. Если bug #11 был исправлен в Checkpoint 0 — в этом checkpoint'е он не должен вернуться.

### 6.10 Тесты

Backend:
```js
it('POST /my/diary accepts pgic_feel', async () => { ... });
it('POST /my/diary rejects invalid pgic_feel', async () => { ... });
it('GET /my/diary/trend returns correct dates', async () => { ... });
it('POST /my/diary/:id/photos rejects 4th photo', async () => { ... });
it('DELETE /my/diary/:id/photos/:pid denies other patient', async () => { ... });
```

Frontend:
```js
it('shows PGIC info-bar when pgicFeel prop set', () => { ... });
it('initial pain 2 for better, 4 for same, 6 for worse', () => { ... });
it('ROM ± buttons clamp 60-180', () => { ... });
it('photo upload triggers POST with FormData', async () => { ... });
it('sparkline renders 14 points from trend API', () => { ... });
```

### 6.11 Обновление CLAUDE.md

БД-схема `diary_entries`: добавь 4 новые колонки.
Новая таблица `diary_photos`.
API: добавь в список `GET /my/diary/trend`, `POST /my/diary/:id/photos`, `DELETE /my/diary/:id/photos/:pid`.
В «Открытые баги» — отметь bug #6 как закрытый.
Миграции: добавь `20260419_diary_structured_fields.sql`.

### 6.12 Checks

```bash
cd backend && npm test 2>&1 | tail -20
cd frontend && npm test -- --watchAll=false 2>&1 | tail -20

psql -U postgres -d azarean_rehab -c "\d diary_entries" | grep -E "pgic|rom|better|pain_when"
psql -U postgres -d azarean_rehab -c "\d diary_photos"

# Проверка что backend не падает при photo upload
# (вручную через curl или Postman с реальной картинкой)
```

### 6.13 Commits & STOP

1. `feat(backend): diary structured fields migration + diary_photos table`
2. `feat(backend): /my/diary accepts pgic_feel, rom_degrees, better_list, pain_when`
3. `feat(backend): /my/diary/trend endpoint`
4. `feat(backend): photo upload for diary entries (3 max, 10MB, sharp)`
5. `feat(patient): DiaryScreen redesign per v12 (structured + sparkline + photos)`
6. `fix(patient): remove notes serialization in DiaryScreen (bug #6)`
7. `docs: update CLAUDE.md with diary migration + bug #6 closed`
8. `test(backend+patient): diary structured fields + photo upload coverage`

**STOP ↓**

В отчёте: полный прогон всех тестов, результат `\d` обеих таблиц, количество строк диагностики по bug #11 (если был возврат).

---

## CHECKPOINT 7 — Roadmap redesign

**Цель:** `RoadmapScreen.js` → v12 `Roadmap` с timeline, exit-criteria (текст), pulse-dot animation.

Это последний checkpoint Сессии 1. Самый лёгкий.

### 7.1 Redesign RoadmapScreen.js

Перепиши по v12 (функция `Roadmap`, L961-1231). Блоки:

1. Header + `<AvatarBtn>`
2. Timeline — 6 фаз, каждая с {Ic, color, n, w, wStart, wEnd}. Хардкод из seed'а или из `GET /api/rehab/phases/acl`.
3. Current phase marker — pulse-dot animation
4. Current phase expanded card — 4 tab'а (Цели/Нельзя/Можно/Боль), exit-criteria list
5. Future phases collapsed, tap «Подробнее» → accordion

### 7.2 Данные

`GET /api/rehab/phases/acl` (public endpoint — есть по бриф). Возвращает все 6 фаз. `rehab_phases` таблица содержит goals, restrictions, criteria_next, allowed, pain, daily, red_flags, faq как текст.

**Для текстовых полей:** если они разделены `\n` — split по строкам. Если markdown — используй существующий парсер (если есть) или простой split.

**Exit-criteria:** в v12 показывает {m, req, cur, met} массив. У вас в `rehab_phases.criteria_next` — текст. Для MVP: просто рендери `criteria_next` как список строк, **без** cur/met индикаторов. Это Вариант A из migration plan. Вариант B (с реальной проверкой метрик) — в Сессии 3.

### 7.3 Current phase определяется по rehab_programs

`GET /api/rehab/my/program` → `current_phase` (integer 1-6). Для этого пациента в UI — активная фаза.

```js
const isCurrent = (phase) => phase.phase_number === program.current_phase;
const isPast = (phase) => phase.phase_number < program.current_phase;
const isFuture = (phase) => phase.phase_number > program.current_phase;
```

### 7.4 Тесты

```js
it('renders all 6 phases from API', () => { ... });
it('marks current phase with pulse-dot', () => { ... });
it('past phases show checkmark', () => { ... });
it('current phase expanded by default', () => { ... });
it('future phase expandable via tap', () => { ... });
it('shows exit criteria list for current', () => { ... });
```

### 7.5 Checks

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -15
```

### 7.6 Commits & STOP

1. `feat(patient): RoadmapScreen redesign per v12 (timeline + exit criteria)`
2. `test(patient): Roadmap phase rendering + current marker`

**STOP ↓ FINAL**

В финальном отчёте Сессии 1:
- Список всех merged коммитов
- Bugs closed: #6, #11 (ожидаем), #12 (F5 flicker)
- Migrations applied: `20260418_*`, `20260419_*`
- Новые API: `/my/diary/trend`, `/my/diary/:id/photos` (2 endpoint'а), расширенные `/me`, `/my/messages`, `/my/diary`
- Новые frontend-компоненты в `components/ui/`
- Оставшиеся open issues / TODOs в коде (grep `TODO` по фронтенду и бэкенду)
- Что уходит в Сессию 2

---

## Общие правила на все checkpoints

### Формат коммитов
`<type>(<scope>): <short desc>` где:
- `type`: feat / fix / refactor / test / docs / chore
- `scope`: patient / backend / docs / none

### Перед каждым коммитом
```bash
# Backend
cd backend && npm test 2>&1 | tail -5

# Frontend
cd frontend && npm test -- --watchAll=false 2>&1 | tail -5

# ESLint на изменённых файлах
```

Если тесты падают — НЕ коммить. Разберись.

### Что делать при заблокированной работе

Если на каком-то шаге не можешь продолжить (не хватает информации, непонятный edge case, подозрение на ломающее изменение) — **STOP раньше срока** и напиши пользователю:
1. На каком именно суб-шаге остановился
2. Что конкретно блокирует
3. Что пробовал
4. Какое решение от пользователя нужно

Не делай догадки на важных развилках (API contracts, БД-схемы, UX-решения). Лучше спросить.

### Arithmetic

Арифметика — ВСЕГДА через код:
```bash
node -e "console.log(34 * 7)"
# или
psql -d azarean_rehab -c "SELECT COUNT(*) FROM patients WHERE is_active"
```

Никогда в уме. Никогда в чат-ответе «примерно N».

### Никакие emoji в UI

`lucide-react` — единственный источник иконок. Если в v12 референсе где-то inline SVG (кроме Messenger brand glyphs) — заменяй на lucide-эквивалент.

### ExerciseRunner v4 неприкосновенен

Даже если где-то в Exercises-экране видишь что-то связанное с runner'ом — оставь как есть. Если нужно внести изменение — **STOP и спроси**.

---

**End of implementation plan. Начинай с Checkpoint 0.**
