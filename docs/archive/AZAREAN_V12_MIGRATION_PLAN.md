# Azarean Rehab — v12 Migration Plan

> **Scope.** Пошаговое применение прототипа `azarean-v12-final.jsx` к существующему коду в `frontend/src/pages/PatientDashboard/`. Документ executable: каждый этап = один PR с чёткими граничными условиями "готово".
>
> **Версия брифа:** AZAREAN_REHAB_ARCHITECT_BRIEF.md (17 апреля 2026).
> **Версия прототипа:** `azarean-v12-final.jsx` (2120 строк, палитра `#0D9488` / `#F97316`, совместима с текущим `tokens.css`).
>
> **ExerciseRunner v4 не трогаем в этом плане** — LOCKED, ~384 строки, порт из iOS. В v12 прототипе Exercises-экран — это design-reference для будущей сессии, но в migration plan он выносится в Appendix C (не в основной flow PR'ов).

---

## 0. Executive summary

### Решения, зафиксированные до начала работы
1. **Порядок замены экранов:** Profile → Home → Contact → Diary → Roadmap. Exercises не трогаем.
2. **Multi-channel messenger** реализуется двухэтапно: сначала backend + миграция БД под feature-flag, затем frontend-потребители.

### Общая длительность (оценка)
- **Этап 0** (prep, без БД-изменений): 2–3 часа
- **Этапы 1–2** (Profile screen + messenger backend): 6–8 часов
- **Этап 3** (Profile UI для messenger + Telegram management): 3–4 часа
- **Этап 4** (Home redesign): 4–5 часов
- **Этап 5** (Contact redesign + MessengerCTA): 3–4 часа
- **Этап 6** (Diary redesign + PGIC↔Diary shared state + feedback-link): 5–7 часов
- **Этап 7** (Roadmap redesign): 3–4 часа
- **Итого:** ~26–35 часов сфокусированной работы, распределённых по ~8 PR'ам.

### Риски в порядке убывания
1. **DiaryScreen crash** (bug #11 из брифа) — бандлер указывает на `ContactScreen.js:552`, вероятно source map issue. Перед Этапом 6 обязательно разобраться (см. Appendix A). Если игнорировать — любой редизайн Diary будет хрупким.
2. **F5 flicker** (bug #12) — не блокер для миграции, но пользователь будет видеть мелькание логина чаще при частых переходах на профиль/дашборд. Фиксим между Этапом 1 и 2.
3. **@uiw/react-md-editor** в Diagnoses ПКС-описании — инструкторский экран, не затрагивается миграцией, но пакет держим во избежание случайного drop при bundle-optimization.

---

## 1. Маппинг v12 → существующие компоненты

| v12 прототип | Существующий компонент | Действие |
|---|---|---|
| `C` palette (teal #0D9488, coral #F97316) | `frontend/src/pages/PatientDashboard/tokens.css` | **Совпадает.** Проверить соответствие `--pd-*` переменных и при необходимости дозаполнить (см. Этап 0.2) |
| `Ico`, `IcUser`, `IcMail`, `IcLock`, `IcLogOut`, `IcHeart`, `IcPencil` и др. | `lucide-react@0.555` | Использовать lucide-эквиваленты (`User`, `Mail`, `Lock`, `LogOut`, `Heart`, `Pencil`, `ChevronRight`, ...) вместо inline SVG. Проектное правило: **только lucide-react**. |
| `IcTelegram`, `IcWhatsApp`, `IcMax` (brand glyphs) | Нет эквивалента в lucide | Оставить как локальные inline SVG-компоненты в `PatientDashboard/components/ui/MessengerIcons.js` (новый файл). Это не UI-иконки общего назначения, а брендовые глифы. |
| `IllKnee` (custom SVG illustration) | Нет | Создать `PatientDashboard/components/ui/IllKnee.js`. |
| `Ring` | `ui/ProgressRing` | **Уже есть.** Сверить API — v12 использует `<Ring pct size sw>{children}</Ring>`, существующий, вероятно, похож. Унифицировать, если нужно. |
| `Pill` | `ui/ChipGroup` (частично) | ChipGroup — группа, Pill — одна. Добавить `ui/Pill.js` или использовать internal `Chip` из ChipGroup, если экспортирован. |
| `Section` | Локально в каждом `*Screen.js` | Вынести в `ui/Section.js` (ре-юз 6+ раз). |
| `AvatarBtn` | **Нет** | Создать `ui/AvatarBtn.js`. Используется во всех 5 табах. |
| `MessengerCTA` | **Нет** | Создать `ui/MessengerCTA.js`. Используется в Diary, Contact и (в будущем) Exercises. |
| `SettingsRow` | Нет | Создать `ui/SettingsRow.js`. Используется только в Profile, но 8+ раз. |
| `ScreenHeader` | Inline в каждом экране | Создать `ui/ScreenHeader.js`, унифицировать title + subtitle + AvatarBtn pattern. |
| `Switch` | `ui/TabBar` содержит toggle-like элементы, но именно switch'а нет | Создать `ui/Switch.js`. Используется в Profile + Contact Zari-виджете. |
| `Nav` (5-таб bottom nav) | `ui/TabBar` | **Уже есть.** Сверить, что API совпадает (5 табов: Главная/Путь/Занятие/Дневник/Связь, с поднятой CTA-кнопкой занятия). |
| `Home` | `components/HomeScreen.js` | Full redesign (Этап 4). |
| `Roadmap` | `components/RoadmapScreen.js` | Full redesign (Этап 7). |
| `Exercises` | `components/ExercisesScreen.js` + `ExerciseRunner.js` | **НЕ ТРОГАЕМ.** Прототипный Exercises — референс для будущей работы. |
| `Diary` | `components/DiaryScreen.js` | Full redesign (Этап 6), предварительно фикс bug #11. |
| `Contact` | `components/ContactScreen.js` | Redesign без messenger picker (Этап 5). |
| `Profile` | `components/ProfileScreen.js` | Full redesign как overlay (Этап 1). Текущий ProfileScreen сейчас — один из 6 табов в нав; переносим в overlay. |
| `App` state management (`tab`, `profileOpen`, `pgicFeel`, `primaryMessenger`, `allDone`, `feedbackFromT`) | `PatientDashboard.js` | Расширить state: добавить `profileOpen`, `pgicFeel`. `primaryMessenger` приходит из `patient` через `PatientAuthContext`. `feedbackFromT` — из API `/api/rehab/my/messages` (есть unread с `linked_diary_id NOT NULL`). |

### Критичный архитектурный сдвиг
Сейчас `ProfileScreen` — **таб в навигации** (6 табов). В v12 — **overlay** (5 табов + аватар справа сверху). Это значит:
- В `PatientDashboard.js` нужно убрать Profile из массива табов
- Добавить state `profileOpen` и условный рендер `<ProfileScreen onClose={...}/>` поверх
- `TabBar` (`ui/TabBar`) нужно переконфигурировать на 5 табов. Проверить, не хардкодится ли где число табов.

---

## 2. Этап 0 — Prep (без БД-изменений, без feature-flag)

**Цель:** подготовить ground для последующих этапов. Изменения невидимы для пользователя — только внутренняя рефакторинг + добавление shared-компонентов.

**PR #0: `feat(patient): extract shared UI primitives from v12 prototype`**

### 0.1 Проверка `tokens.css`
Сверить существующие `--pd-*` переменные с палитрой `C` из прототипа:

```
v12 C.teal      = #0D9488  → ожидаем --pd-color-primary
v12 C.tealDk    = #0F766E  → --pd-color-primary-dark
v12 C.tealMid   = #14B8A6  → --pd-color-primary-mid
v12 C.tealBg    = #F0FDFA  → --pd-color-primary-bg
v12 C.orange    = #F97316  → --pd-color-accent
v12 C.ok/warn/err + pain[11] + phase[6]
```

**Действие:** открыть `PatientDashboard/tokens.css` и, если чего-то не хватает, дозаполнить. Без переименования существующих переменных — только добавление недостающих. Палитра `pain[11]` (DVPRS 2.0 11 цветов) уже должна быть (из брифа: "DVPRS 2.0 pain scale").

**Acceptance:** `tokens.css` содержит все 30+ переменных, покрывающих прототип. Diff в репо — ТОЛЬКО новые `--pd-*` переменные в конце файла.

### 0.2 Создать новые UI-примитивы (shared, без использования)

Создаём в `PatientDashboard/components/ui/` и экспортируем из `index.js`:

- `AvatarBtn.js` — портирован из v12, использует `--pd-*` переменные вместо `C.*`. `<AvatarBtn onClick initial="В" dark={false}/>`. Initial — prop, а не хардкод.
- `MessengerCTA.js` — портирован, принимает `primary`, `onSend`, `label`, `style` + импорт `MessengerIcons` из того же каталога. Для этапа 0 **MESSENGERS конфиг захардкоден в компоненте** (TG/WA/MAX URLs из v12 прототипа). В этапе 2 заменяется на data-driven.
- `SettingsRow.js` — портирован, принимает `label`, `value`, `Icon` (прокидывает lucide-компонент), `iconColor`, `readonly`, `destructive`, `onClick`, `last`.
- `ScreenHeader.js` — портирован, `<ScreenHeader title subtitle onOpenProfile/>`.
- `Switch.js` — портирован, `<Switch on tap/>`.
- `Section.js` — портирован, `<Section title Icon sub>{children}</Section>`.
- `Pill.js` — портирован, `<Pill active color Icon onClick>...</Pill>`.
- `MessengerIcons.js` — brand glyphs TG/WA/MAX + MESSENGER_ICONS map + MESSENGERS config.
- `IllKnee.js` — custom illustration.

**Acceptance:**
- Все 9 файлов добавлены, `index.js` обновлён экспортами.
- `npm test -- --watchAll=false` — ни один существующий тест не падает.
- Bundle size не вырос >10 KB (компоненты маленькие, без heavy-deps).

### 0.3 Проверка `TabBar` (5 vs 6 табов)
Сейчас, судя по `PatientDashboard.js`, табов 6 (Home/Exercises/Diary/Roadmap/Profile/Contact). В v12 — 5 (Profile вынесен в overlay). НО в этом этапе **таб-бар НЕ трогаем** — Profile-overlay появится в Этапе 1, и только тогда удалим таб.

**Acceptance:** таб-бар остаётся 6-табовым. Никаких визуальных изменений.

### 0.4 F5 flicker — проактивный фикс (bug #12)
Между 0.3 и 1.0 рекомендую фикс F5 flicker, потому что после Этапа 1 (Profile overlay) пользователи будут чаще рефрешить страницу с открытым overlay и регрессия будет заметнее.

**Патч:** в `App.js` (или где `PatientAuthProvider`) добавить splash-state:

```js
// PatientAuthContext.js
const [loading, setLoading] = useState(true);  // уже есть

// PatientAuthProvider layout в App.js
function PatientAuthLayout() {
  const { loading } = usePatientAuth();
  if (loading) return <PatientSplash />;  // новый компонент, не Login!
  return <Outlet />;
}
```

`PatientSplash` — простой centered `<div>` с logo + spinner, рендерится во время `getMe()`. НЕ редиректит на login.

**Acceptance:** F5 на `/patient-dashboard` больше не показывает login. 15 ручных рефрешей — ни одной вспышки.

### 0.5 PR #0 checklist перед merge
- [ ] `tokens.css` дозаполнен
- [ ] 9 новых файлов в `ui/` + `index.js`
- [ ] Все 156 frontend-тестов зелёные
- [ ] ESLint warnings не выросли
- [ ] Визуально ничего не изменилось для пользователя
- [ ] F5 flicker исчез
- [ ] Диагноз + дата операции остаются read-only (сверка с брифом раздел 15: "Стандарт минус диагноз")

---

## 3. Этап 1 — Profile screen как overlay

**Цель:** заменить табовый `ProfileScreen` на overlay, открываемый по тапу на аватар. Многоканальный messenger в этом этапе **ещё НЕ реализуется** — в Profile отображается только placeholder и disabled-state. Реальная функциональность — Этапы 2+3.

**PR #1: `feat(patient): profile overlay with avatar-based navigation`**

### 1.1 Перенос `ProfileScreen` в overlay

**Файлы:**
- `PatientDashboard/PatientDashboard.js` — удалить Profile из массива табов, добавить `profileOpen` state, условный рендер
- `PatientDashboard/components/ProfileScreen.js` — полный redesign по v12 `Profile` компоненту

Текущий `ProfileScreen` содержит: avatar upload, смена пароля, настройки уведомлений, привязка Telegram. Всё это **сохраняется** в новом overlay, плюс добавляется:
- Identity block (gradient card с большим аватаром 72×72)
- Секция «Реабилитация» (диагноз + дата операции read-only, куратор → tap закрывает overlay и переводит на Contact)
- Секция «Связь» с двумя строками: «Основной канал связи» (disabled в этапе 1, tooltip «Скоро будет доступно») и «Напоминания от Zari» (полный функционал Telegram-привязки)
- Edit modal (bottom sheet) для name и phone
- Версия приложения в футере

### 1.2 AvatarBtn на всех 5 экранах

- `HomeScreen`, `RoadmapScreen`, `DiaryScreen`, `ContactScreen`, `ExercisesScreen` — в каждом на самый верх добавляется `<ScreenHeader onOpenProfile={...}/>` или `<AvatarBtn>` в существующий header
- `ExerciseRunner.js` — **НЕ ТРОГАЕМ**, LOCKED. AvatarBtn добавляется только на `ExercisesScreen` (list view), не внутрь runner'а
- `PatientDashboard.js` прокидывает `onOpenProfile={() => setProfileOpen(true)}` в каждый экран

### 1.3 TabBar: 6 → 5 табов

- `ui/TabBar.js` — убрать Profile из массива
- Проверить активный taб по умолчанию остаётся Home

### 1.4 Edit modal для name/phone

В существующем коде, скорее всего, редактирование идёт через inline input или отдельный роут. В v12 — bottom sheet modal. **Решение:** если inline работает — оставить. Если отдельная страница — внедрить bottom sheet из v12. Критерий: один screen для всего профиля, без навигации.

**ВАЖНО:** `email` и `birth_date` остаются read-only и в модалку не попадают. `diagnosis` и `surgery_date` — read-only, редактируются инструктором. Это жёсткая граница из брифа «scope: Стандарт минус диагноз».

### 1.5 API-расширение — опциональное

Если backend'овский `PUT /api/patient-auth/me` сейчас принимает только `full_name` и `phone` — фронт работает. Если нет — добавить поддержку в `routes/patientAuth.js`:

```js
const allowed = ['full_name', 'phone'];  // НЕ email, НЕ birth_date, НЕ diagnosis
const updates = Object.keys(req.body).filter(k => allowed.includes(k));
// Dynamic SET clause через параметризованные запросы
```

### 1.6 Тесты

Расширить `PatientDashboard.test.js` или добавить `ProfileScreen.test.js`:
- Тап на AvatarBtn открывает overlay
- Тап на Cancel/ESC закрывает overlay
- Edit name → Save → mock `PUT /me` с корректным body
- Email input не рендерится (read-only only)
- Diagnosis field имеет `aria-readonly="true"` или отсутствует как input
- При `user.tgLinked === false` показывается CTA «Подключить Telegram», при `true` — список напоминаний + кнопка «Отвязать»

### 1.7 PR #1 checklist
- [ ] Profile открывается по тапу на AvatarBtn со всех 5 табов
- [ ] Tab bar содержит 5 табов, не 6
- [ ] Edit name и phone работают через bottom-sheet modal
- [ ] Email, birth_date, diagnosis, surgery_date — read-only
- [ ] Telegram-привязка работает (регрессия от текущего ProfileScreen — 0 потерянных функций)
- [ ] «Основной канал связи» в секции Связь показан как disabled placeholder (preparation для Этапа 2–3)
- [ ] Все существующие тесты зелёные + новые тесты Profile passing
- [ ] Бэк не требует изменений, либо minimal allowlist в `PUT /me`

---

## 4. Этап 2 — Backend: multi-channel messenger (feature flag)

**Цель:** подготовить БД и API под выбор предпочитаемого канала связи. Frontend в этом этапе **не использует** новые поля — они остаются невидимы до Этапа 3.

**PR #2: `feat(backend): patient preferred_messenger column + API (feature-flagged)`**

### 2.1 Миграция БД

**Файл:** `backend/database/migrations/20260418_patient_preferred_messenger.sql`

```sql
-- Добавляем канал связи пациента
ALTER TABLE patients
  ADD COLUMN preferred_messenger VARCHAR(20) NOT NULL DEFAULT 'telegram'
  CHECK (preferred_messenger IN ('telegram', 'whatsapp', 'max'));

-- Индекс для аналитики (необязательный)
CREATE INDEX idx_patients_preferred_messenger
  ON patients(preferred_messenger)
  WHERE is_active = true;

-- Для связи ответов куратора с записями дневника (feedback-card в Contact)
ALTER TABLE messages
  ADD COLUMN linked_diary_id INTEGER
  REFERENCES diary_entries(id) ON DELETE SET NULL,
  ADD COLUMN channel VARCHAR(20) NULL
  CHECK (channel IN ('telegram', 'whatsapp', 'max', 'in_app') OR channel IS NULL);

CREATE INDEX idx_messages_linked_diary_id
  ON messages(linked_diary_id)
  WHERE linked_diary_id IS NOT NULL;
```

**Обоснование:**
- `preferred_messenger` — single source of truth. Если `patients.phone` используется в WA deep-link, это прозрачно для схемы (один номер для всех каналов).
- `linked_diary_id` в `messages` — для Diary feedback-card (v12 фича «Татьяна отреагировала на запись 11 апреля»). Nullable — не все сообщения привязаны к дневнику.
- `channel` в `messages` — для аналитики (куда реально ушёл ответ). Nullable legacy.
- Foreign key на `diary_entries(id)` — правильно, потому что diary_entries уже имеет `ON DELETE CASCADE` от patient_id, но здесь SET NULL чтобы не терять сам текст сообщения.

**Миграция backward-compatible:** старые пациенты получают `'telegram'` как default. Нет разрушительных изменений.

### 2.2 Расширение `GET /api/patient-auth/me`

**Файл:** `backend/routes/patientAuth.js` — в GET /me response добавить:

```js
// Был allowlist SELECT — добавляем preferred_messenger
const result = await query(`
  SELECT id, full_name, email, phone, birth_date, diagnosis,
         avatar_url, telegram_chat_id, preferred_messenger,
         last_login_at, created_at
  FROM patients WHERE id = $1
`, [req.patient.id]);
```

Важно: `password_hash` в SELECT по-прежнему НЕТ (закрытая уязвимость из брифа #21).

### 2.3 Расширение `PUT /api/patient-auth/me`

```js
const allowed = ['full_name', 'phone', 'preferred_messenger'];
// Валидация значения на входе:
if (req.body.preferred_messenger) {
  const valid = ['telegram', 'whatsapp', 'max'];
  if (!valid.includes(req.body.preferred_messenger)) {
    return res.status(400).json({
      error: 'INVALID_MESSENGER',
      message: 'Invalid preferred_messenger value'
    });
  }
}
```

### 2.4 Расширение `GET /api/rehab/my/messages`

Сейчас endpoint возвращает сообщения чата пациент↔инструктор. Нужно добавить в SELECT `linked_diary_id` и `channel`, чтобы фронт смог отобразить feedback-карточку в Diary.

```js
SELECT id, sender_id, content, created_at, is_read,
       linked_diary_id, channel
FROM messages WHERE patient_id = $1
ORDER BY created_at DESC;
```

Если сейчас sender_id без FK (технический долг из брифа #10) — не чиним в этом PR, отдельной задачей.

### 2.5 Опциональный эндпоинт: `POST /api/rehab/instructor/messages/:id/link-diary`

Для инструктора — возможность связать ответ с конкретной записью дневника. Не обязателен в MVP этапа 2, может подождать.

### 2.6 Тесты (backend)

Добавить в `backend/tests/__tests__/patientProfile.test.js`:
- `PUT /me` с `preferred_messenger: 'whatsapp'` → 200, БД обновлена
- `PUT /me` с `preferred_messenger: 'skype'` → 400 INVALID_MESSENGER
- `GET /me` возвращает `preferred_messenger` в payload
- Legacy пациенты без обновления имеют `'telegram'` по умолчанию

### 2.7 PR #2 checklist
- [ ] Миграция `20260418_*.sql` применена на dev, БД в порядке
- [ ] `GET /me` и `PUT /me` возвращают / принимают `preferred_messenger`
- [ ] Валидация значения на backend
- [ ] `GET /my/messages` возвращает `linked_diary_id` и `channel`
- [ ] Все 152 backend-тестов зелёные + новые тесты passing
- [ ] Фронт **не использует** эти поля — никаких визуальных изменений (feature flag = implicit: фронт просто не рендерит UI до PR #3)
- [ ] `AZAREAN_REHAB_ARCHITECT_BRIEF.md` — добавить в раздел БД-схемы новые колонки (микро-правка)
- [ ] Rollback план: `ALTER TABLE patients DROP COLUMN preferred_messenger;` безопасен, никто не читает колонку

---

## 5. Этап 3 — Frontend: consume messenger settings

**Цель:** подключить `MessengerCTA`-компонент и Profile-секцию «Основной канал связи» к реальному API. После этого этапа пользователь видит рабочий multi-channel.

**PR #3: `feat(patient): multi-channel messenger UI wired to API`**

### 3.1 `PatientAuthContext`

Добавить в объект `patient`: `preferred_messenger`. Обновить default в тестах.

### 3.2 Profile: enable messenger picker

- Убрать disabled-state из «Основной канал связи»
- Добавить `showMessengerPicker` accordion (как в v12)
- При клике по каналу — оптимистичный update state + `PUT /me` → успех/ролбэк
- Error handling — Toast «Не удалось сохранить, попробуйте ещё раз»

### 3.3 Использование `MessengerCTA` в DiaryScreen и ContactScreen

Этап 5 и 6 будут использовать компонент. В этом PR — **только** добавление рабочей интеграции в Profile + один тестовый usage в Contact (feedback-card).

### 3.4 Deep links

URL-генерация в `MessengerCTA`:
- Telegram: `https://t.me/+79089049130` (постоянный)
- WhatsApp: `https://wa.me/{patient.phone очищенный}` — нужна утилита `phoneToWaLink(phone)` в `frontend/src/utils/`
- MAX: `https://max.ru/u/{STUDIO_MAX_HANDLE}` — хардкод в config, как в v12

**Утилита `phoneToWaLink`:**
```js
export function phoneToWaLink(phone) {
  // +7 (908) 904-91-30 → 79089049130
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
```

⚠️ В v12 прототипе WA URL хардкод `https://wa.me/79089049130` — это номер **студии**, не пациента. Пациент пишет куратору (Татьяне), не наоборот. URL должен указывать на номер студии. Проверить с пользователем перед имплементацией.

### 3.5 Unit-тесты

`frontend/src/pages/PatientDashboard/components/ProfileScreen.test.js`:
- Выбор WhatsApp → `PUT /me {preferred_messenger:'whatsapp'}` → state обновлён
- API failure → Toast + rollback state
- Выбор уже активного канала — no-op

### 3.6 PR #3 checklist
- [ ] `patient.preferred_messenger` доступен через Context
- [ ] Profile → секция Связь → picker работает, сохраняет, валидирует ошибки
- [ ] `MessengerCTA` использует `patient.preferred_messenger` как default
- [ ] WA URL → studio phone (не пациента)
- [ ] MAX URL → studio handle
- [ ] «Другой канал» accordion показывает 2 оставшихся канала
- [ ] Все 156 frontend-тестов зелёные
- [ ] На mobile (сужение до 375px) — кнопки не ломают layout

---

## 6. Этап 4 — Home redesign

**Цель:** `HomeScreen.js` → визуально соответствует v12 `Home`. Логика (данные) — без изменений.

**PR #4: `feat(patient): Home screen redesign v12`**

### 4.1 Данные

Home показывает:
- Greeting + AvatarBtn (уже есть с Этапа 1)
- Hero block (specialist chip → переход на Contact, IllKnee, CTA «Начать/Заполнить дневник», weekly goal)
- PGIC quick-check (Лучше/Так же/Хуже) ← **новое**, state lifted
- Next visit card
- Phase progress ring + stats tooltip
- Daily tip

### 4.2 PGIC state lifted

В `PatientDashboard.js`:
```js
const [pgicFeel, setPgicFeel] = useState(null);
// Передаётся в HomeScreen для изменения и в DiaryScreen для чтения
```

PGIC → Diary pre-population работает так:
- `pgicFeel === 'better'` → initial pain = 2
- `'same'` → 4
- `'worse'` → 6
- `null` → default 3 (как сейчас в DiaryScreen)

### 4.3 Где хранить PGIC?

**Вариант А** (MVP): только client-state. Тап сохраняется только в текущей сессии, при F5 сбрасывается.
**Вариант Б** (нормальный): добавить столбец `diary_entries.pgic_feel VARCHAR(10)` и сохранять как часть дневника.

**Рекомендация:** **Вариант А** в PR #4. **Вариант Б** отложить в Этап 6 (Diary redesign) — как часть расширения dioary_entries.

### 4.4 Next visit — откуда данные

Не предлагать в этом PR, если бэкенд не поставляет. В v12 хардкод "Вт, 22 апреля · 14:00 · Алёна · Белинского 108, ст. 26".

Проверить есть ли уже API для расписания пациента. Если нет — показывать только при наличии поля `next_visit_at` в `/my/dashboard`. Иначе — скрывать секцию graceful, показывать только «Белинского 108» как static info.

### 4.5 Tests

- Снимок рендера
- Тап на PGIC «Лучше» → state updated, tap на «Подробнее» → navigateToTab(3)
- Тап на AvatarBtn → `onOpenProfile` called
- Тап на specialist chip → navigateToTab(4) (Contact)

### 4.6 PR #4 checklist
- [ ] Pixel-perfect соответствие v12 Home
- [ ] PGIC state lifted в PatientDashboard
- [ ] Все static data показываются корректно
- [ ] Нет хардкода phase/week — берётся из API
- [ ] Все тесты passing

---

## 7. Этап 5 — Contact redesign

**Цель:** `ContactScreen.js` → v12 `Contact`. Убираем messenger picker (он теперь в Profile). Добавляем feedback-card с `linked_diary_id`.

**PR #5: `feat(patient): Contact screen redesign v12`**

### 7.1 Данные

Contact показывает:
- Header + AvatarBtn (с Этапа 1)
- Feedback card (Татьяна · последнее сообщение · unread badge · ссылка «К записи 11 апреля» если `linked_diary_id`) + `MessengerCTA` «Ответить»
- Studio location (static)
- Emergency block (103 + +79089049130)
- 4 quick-actions (Задать вопрос / Боль усилилась / Записаться / Отправить фото)
- Zari-status widget (info-only, управление в Profile)

### 7.2 API интеграция

`GET /api/rehab/my/messages?limit=1&sender=instructor` → взять последнее входящее сообщение от куратора. Плюс `unread_count` (если endpoint его не возвращает — см. Этап 6.4).

Если `msg.linked_diary_id` есть → отрендерить chip «К записи {formatDate}».

### 7.3 ContactScreen.js:552 bug (bug #11)

**Это ключевой блокер.** Bug reports упомянуто, что crash stack trace указывает на `ContactScreen.js:552`, но проявляется при тапе на DiaryScreen. Вероятная причина (см. Appendix A) — bundler source map map'ит чужой файл.

**План:** **перед этим PR** разобраться с багом, не оставляя на Этап 6. Если Contact редизайним без исправления — баг переедет на новую версию файла.

### 7.4 4 quick-actions — куда ведут

Сейчас (в существующем коде) скорее всего «Задать вопрос» → генерация сообщения через API + redirect в мессенджер. Сохраняем это поведение. Если в существующем ContactScreen такие кнопки не работали — в v12 они показаны, но логика TBD (см. Appendix B, вопросы к пользователю).

### 7.5 Zari-status widget

В v12 показывает 4 типа напоминаний (Утро/Вечер/Совет дня/Смена фазы) со `Switch`, но управление переехало в Profile. **Варианта 2:**

**A)** Оставить widget info-only (как в прототипе v12: показывает статусы, Switch'и работают локально, сохранение через Profile). Некрасиво — switch'и не синхронизированы с настоящими настройками.

**B)** Вообще убрать widget из Contact, оставить только в Profile. Чище архитектурно.

**Рекомендация:** **B**. В v12-прототипе widget в Contact остался "just to show the layout", в проде уместнее убрать. Пользователь подтверди.

### 7.6 PR #5 checklist
- [ ] Bug #11 (DiaryScreen crash pointing to ContactScreen:552) разобран
- [ ] Contact выглядит по v12
- [ ] Feedback-card работает с `linked_diary_id`
- [ ] `MessengerCTA` использует `preferred_messenger`
- [ ] Quick-actions работают (либо сохранили текущую логику, либо определили новую)
- [ ] Zari widget: решение A или B зафиксировано
- [ ] Emergency (103 + +79089049130) — tel: links работают

---

## 8. Этап 6 — Diary redesign + shared state

**Цель:** `DiaryScreen.js` → v12 `Diary`. Исправляем структурное хранение полей (bug #6).

**PR #6: `feat(patient): Diary screen redesign v12 + structured fields`**

### 8.1 Данные (с фикс bug #6)

Сейчас, согласно брифу:
> DiaryScreen — структурированные данные сериализуются в текст `notes` (хрупкий парсинг)

В v12 Diary имеет поля: `pain`, `when`, `swelling`, `mobility` (ROM), `mood` (better_list), `sleep_quality`, `photos[]`, `notes`. Текущая схема `diary_entries` уже содержит колонки `pain_level`, `swelling`, `mobility`, `mood`, `sleep_quality`, `exercises_done`, `notes`.

**Действия:**
- Убрать сериализацию в `notes` — использовать существующие колонки
- Добавить миграцию для `pgic_feel VARCHAR(10)`, `rom_degrees INTEGER`, `better_list JSONB DEFAULT '[]'`, `pain_when VARCHAR(20)`

**Миграция `20260419_diary_structured_fields.sql`:**
```sql
ALTER TABLE diary_entries
  ADD COLUMN pgic_feel VARCHAR(10) CHECK (pgic_feel IN ('better','same','worse') OR pgic_feel IS NULL),
  ADD COLUMN rom_degrees INTEGER CHECK (rom_degrees >= 0 AND rom_degrees <= 180),
  ADD COLUMN better_list JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN pain_when VARCHAR(20) CHECK (pain_when IN ('morning','day','evening','exercise','walking') OR pain_when IS NULL);
```

### 8.2 Photo upload

В v12 — 3 photo max с плейсхолдерами. В production — реальная загрузка (multer на бэке уже настроен для аватаров, переиспользовать pattern).

**Подход:** отдельная таблица `diary_photos` (id, diary_entry_id FK CASCADE, file_path, created_at). Или добавить `photos JSONB` в `diary_entries` с массивом URL-ов.

**Рекомендация:** **`diary_photos` отдельная таблица** — более нормальный SQL, легче GDPR-удалить (bug #8), проще кешировать. Миграция добавляется к `20260419_*.sql`.

```sql
CREATE TABLE diary_photos (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_diary_photos_entry ON diary_photos(diary_entry_id);
```

API: `POST /api/rehab/my/diary/:entry_id/photos` (multer up to 3 photos per entry), `DELETE /api/rehab/my/diary/:entry_id/photos/:photo_id`.

### 8.3 PGIC shared state (от Этапа 4)

`pgicFeel` из PatientDashboard передаётся в Diary. При первом рендере Diary:
- Если `pgicFeel !== null` AND нет сегодняшней записи → показывается info-bar «Данные подставлены из быстрой отметки», initial pain = 2/4/6
- Если запись уже есть — pgic игнорируется, читаем из БД

### 8.4 Sparkline тренда боли (14 дней)

Нужен endpoint `GET /api/rehab/my/diary/trend?days=14` возвращает `[{date, pain_level}]`. Если сейчас данные лежат в `diary_entries` — запрос простой.

```sql
SELECT entry_date::text AS date, pain_level AS pain
FROM diary_entries
WHERE patient_id = $1 AND entry_date > CURRENT_DATE - INTERVAL '14 days'
ORDER BY entry_date ASC;
```

Note: `entry_date::text` для JSON timezone safety (правило проекта).

### 8.5 Feedback from Tatyana

Уже реализовано в Этапе 2 (`linked_diary_id`). В Diary показываем feedback-card в следующих случаях:
- Есть `messages WHERE linked_diary_id = current_entry.id AND sender=instructor AND NOT is_read` → большой блок «Татьяна отреагировала» + текст + дата
- Нет записи или нет feedback'а → блок скрыт

### 8.6 DiaryScreen crash bug #11 fix

Вероятная причина (см. Appendix A). Исправляется до / во время этого PR.

### 8.7 PR #6 checklist
- [ ] Миграция `20260419_*.sql` применена
- [ ] `POST /my/diary` принимает новые поля
- [ ] `GET /my/diary/trend` работает
- [ ] Photo upload работает (3 max per entry)
- [ ] Bug #6 закрыт (структурные поля вместо парсинга notes)
- [ ] Bug #11 закрыт
- [ ] PGIC shared state работает (тап на Home → initial pain в Diary)
- [ ] Sparkline рендерится корректно даже на 0 записей (fallback)
- [ ] feedback-card показывается только при `linked_diary_id`

---

## 9. Этап 7 — Roadmap redesign

**Цель:** `RoadmapScreen.js` → v12 `Roadmap`. Добавляем exit-criteria view.

**PR #7: `feat(patient): Roadmap screen redesign v12 with exit-criteria`**

### 9.1 Данные

В v12 для текущей фазы показываются: 4 tab'а (Цели/Нельзя/Можно/Боль) + секция «Критерии перехода» со списком {m, req, cur, met}.

Сейчас `rehab_phases` таблица содержит: goals, restrictions, criteria_next, icon, color, allowed, pain, daily, red_flags, faq — всё есть. Нужно:
- `goals` парсить (text → list)? Или оно уже массив? Проверить схему. Вероятно text с `\n`-разделением, как в seed `acl_phases.sql`.
- `criteria_next` — это текстовое поле, не структура. Прототип v12 показывает `[{m, req, cur, met}]`, где `cur` — **текущее значение пациента**.

### 9.2 Миграция для criteria-values (опциональная)

Для полноценной реализации exit-criteria с «met/not met» нужно:

**Вариант A (текущие данные):** `criteria_next` остаётся текстом, в v12 показываем его как plain list без `cur`/`met`. Упрощённый UI.

**Вариант B (полноценный):** ввести отдельную таблицу `phase_exit_criteria` со структурой {phase_id, metric, target_value, unit, auto_check_field (из diary_entries)}, + на клиенте считаем met.

**Рекомендация:** **Вариант A в PR #7**, **Вариант B** отдельно в будущей сессии — требует согласования с куратором (Татьяной), какие именно метрики и как они проверяются.

### 9.3 Current phase marker

`rehab_programs.current_phase` уже есть — используем для `isCurrent` логики + pulse-dot animation.

### 9.4 PR #7 checklist
- [ ] Все 6 фаз рендерятся с timeline
- [ ] Current phase выделен, past/future — разные стили
- [ ] Exit-criteria показываются для current phase (Вариант A: plain list)
- [ ] Pulse-dot animation работает
- [ ] Phase FAQ expandable
- [ ] Future-phase «Подробнее» accordion

---

## 10. Что остаётся после PR #7

### Не затронуто миграцией
- **Exercises / ExerciseRunner** — LOCKED v4. В будущей сессии рассмотрим адаптацию под v12 дизайн, но не раньше чем пользователь явно попросит.
- **Admin panel** — не часть патиентского опыта, не трогаем
- **Instructor Dashboard** — не трогаем
- **Telegram bot** (/start, /diary, /tip, /status) — функционально работает, UI не меняется

### Сессия 2 задачи (из исходного запроса)
- F5 flicker полный аудит (если остались артефакты)
- Остальные MEDIUM/BUG из брифа
- Деплой на VDS `185.93.109.234` с решением конфликта субдоменов `rehab.azarean.ru`/`api.azarean.ru`

### Сессия 3 задачи
- React 19 / PWA implementation layer (View Transitions, Service Worker, iOS PWA quirks, Web Push, manifest.json, Lighthouse)

---

## 11. Сводка миграций БД

Всего 2 новых миграции для этого migration plan:

| Файл | Этап | Обратная совместимость |
|---|---|---|
| `20260418_patient_preferred_messenger.sql` | 2 | Да, default `'telegram'` |
| `20260419_diary_structured_fields.sql` | 6 | Да, все новые колонки NULL или DEFAULT |

**Rollback strategy:**
```sql
-- rollback migration 20260418
ALTER TABLE messages DROP COLUMN IF EXISTS channel;
ALTER TABLE messages DROP COLUMN IF EXISTS linked_diary_id;
DROP INDEX IF EXISTS idx_patients_preferred_messenger;
ALTER TABLE patients DROP COLUMN IF EXISTS preferred_messenger;

-- rollback migration 20260419
DROP TABLE IF EXISTS diary_photos;
ALTER TABLE diary_entries
  DROP COLUMN IF EXISTS pain_when,
  DROP COLUMN IF EXISTS better_list,
  DROP COLUMN IF EXISTS rom_degrees,
  DROP COLUMN IF EXISTS pgic_feel;
```

---

## 12. Сводка API endpoints

### Новые
- `GET /api/rehab/my/diary/trend?days=14` — тренд боли (Этап 6)
- `POST /api/rehab/my/diary/:entry_id/photos` — загрузка фото (Этап 6)
- `DELETE /api/rehab/my/diary/:entry_id/photos/:photo_id` — удаление фото (Этап 6)

### Расширенные
- `GET /api/patient-auth/me` — возвращает `preferred_messenger` (Этап 2)
- `PUT /api/patient-auth/me` — принимает `preferred_messenger` (Этап 2)
- `POST /api/rehab/my/diary` — принимает `pgic_feel`, `rom_degrees`, `better_list`, `pain_when` (Этап 6)
- `GET /api/rehab/my/messages` — возвращает `linked_diary_id`, `channel` (Этап 2)

### Без изменений
- `POST /api/patient-auth/login`, `/register`, `/refresh`, `/logout` — как есть
- `GET /api/rehab/my/dashboard` — как есть
- `GET /api/rehab/phases/:type` — как есть
- Telegram-роуты — как есть

---

## 13. Чек-лист перед каждым PR (шаблон)

- [ ] Миграция протестирована на dev
- [ ] Rollback SQL заранее написан в комменте PR
- [ ] `npm test` в backend: все зелёные
- [ ] `npm test` в frontend: все зелёные
- [ ] Визуальная проверка на 4 размерах экранов: 375px (iPhone SE), 393px (iPhone 14), 430px (iPhone Pro Max), 768px (iPad portrait)
- [ ] Никаких emoji в UI — только lucide-react
- [ ] `authenticatePatient` cookie-middleware на всех state-changing endpoints
- [ ] `requireSameOrigin` CSRF на POST/PUT/DELETE
- [ ] Параметризованные SQL-запросы (`$1, $2`)
- [ ] Нет `success: true/false` в API response — формат `{ data, message?, total? }`
- [ ] Нет обращений к `pool` напрямую — только `query()` / `getClient()`
- [ ] Тёмная тема ещё не реализована — учитывать при переходе позже
- [ ] Обновлён `AZAREAN_REHAB_ARCHITECT_BRIEF.md` в разделах БД-схемы / API / состояния работ
- [ ] ExerciseRunner v4 не затронут (если случайно изменён — отменить изменения)

---

## 14. Что можно сделать уже сейчас без backend-изменений

Для ускорения визуального прогресса — ряд подготовительных изменений не требует миграций:

1. **Этап 0** целиком — shared UI primitives
2. **Этап 1** — Profile overlay с hardcoded `preferred_messenger = 'telegram'` для всех пациентов. Messenger-picker в секции "Связь" отображается disabled.
3. **Этап 4 (Home redesign) частично** — визуал + PGIC client-state (без БД persist). Можно сделать параллельно с Этапом 2.
4. **Deep links Telegram/WhatsApp/MAX** в Profile — рабочие даже без настройки preferred_messenger (просто ведут на все три мессенджера как кнопки).
5. **F5 flicker** — чисто frontend, без бэка.

**Рекомендация:** PR #0 + PR #1 + frontend-часть PR #4 можно вести последовательно, backend PR #2 параллельно. После merge PR #2 → подхватываем PR #3 и подвешиваем рабочий multi-channel.

---

## Appendix A — DiaryScreen crash investigation (bug #11)

**Симптом:** `TypeError: Cannot convert undefined or null to object at entries` при клике на DiaryScreen. Stack trace указывает на `ContactScreen.js:552` — разные файлы, указанная строка.

**Возможные причины в порядке вероятности:**

### 1. Bundler source-map collision
CRA webpack иногда мёрджит chunks и source-map'ы становятся рассинхронизированы. Проверить:
- В DevTools Network → отключить кеш → найти реальный файл, где генерируется ошибка
- Смотреть по времени: ContactScreen.js:552 может быть чужим chunk'ом в production build, который **случайно** включает минифицированный DiaryScreen

**Фикс:** запустить `npm run build` и проверить source-map'ы. Если в dev работает нормально, а в prod падает — это точно source map issue.

### 2. `Object.entries(null)` в рендере
Классика. Где-то:
```js
{Object.entries(data?.foo).map(...)}  // если data или data.foo null — crash
```
Нужно найти все `Object.entries` в DiaryScreen и ContactScreen, проверить guard'ы.

```bash
grep -rn "Object\.entries" frontend/src/pages/PatientDashboard/components/
```

### 3. API response shape change
Если `GET /my/diary` вернул `null` там, где ожидается объект — и DiaryScreen делает `Object.entries(response.data)` без fallback. Особенно после унификации API-формата в апреле (бриф, раздел завершённых #12) — может быть regression.

**Фикс:**
```js
const entries = response.data || {};  // fallback
Object.entries(entries).map(...)
```

### 4. React 19 StrictMode double-mount
Менее вероятно, но в StrictMode эффекты запускаются дважды. Если в useEffect есть неидемпотентный код, работающий с `entries`, — может падать на втором проходе.

**План действий:**
1. Reproduce на dev
2. Проверить реальный source (через production build + source maps)
3. Grep Object.entries, добавить fallback
4. Если не помогло — смотреть React DevTools на момент crash

---

## Appendix B — Вопросы к пользователю перед стартом

1. **WhatsApp URL** — номер `+79089049130` в v12 прототипе. Это номер **студии** (куда пациент пишет куратору)? Подтвердить, чтобы в `MessengerCTA` зафиксировать правильную логику (не `patient.phone`).
2. **MAX URL handle** — в v12 hardcoded `f9LHodD0cOI4hg2uUbj3KvRrSd4aLawyoE0EQx969NKJOXeA1Selj8x0qDc`. Это permanent handle куратора Татьяны?
3. **Zari-widget в Contact** — оставляем как info-only или убираем полностью (Раздел 7.5, варианты A/B)?
4. **Quick-actions в Contact** — 4 кнопки (Задать вопрос / Боль усилилась / Записаться / Отправить фото). Что они делают в существующем ContactScreen? Сохраняем логику или придумываем новую?
5. **Next visit** на Home — есть ли уже API, возвращающий ближайший приём пациента? Или в MVP показывать hardcoded studio info?
6. **PGIC persist** — сохраняем в БД (`diary_entries.pgic_feel`) или только в session? Пользователь говорил о shared state с Diary, но persistance не обсуждали.
7. **Avatar initial** в AvatarBtn — сейчас v12 хардкодит «В». В проде — брать первую букву `full_name`? Подтвердить.

---

## Appendix C — Exercises / ExerciseRunner (не в этом plan'е)

Для справки: в v12 прототипе экран Exercises представляет собой полноценный specialist-authored block renderer (progress bar, dots, видео-плейсхолдер, accordion инструкций, sets grid, RPE zones, pain gradient slider, red-flag warning, комментарий, финальный summary).

**Текущая архитектура:**
- `ExercisesScreen.js` — список комплексов
- `ComplexDetailView.js` — детали комплекса
- `ExerciseRunner.js` — **LOCKED v4**, ~384 строки, порт из iOS-эталона

**Причина не трогать:**
- Внутри runner'а — выверенный flow, RPE zones, pain gradient, rest timer, голубой фон таймера, slide-in animations `pdIn`/`pdBk`
- CSS использует `--az-*` iOS-палитру в `.pd-runner` scope (не `--pd-*`)
- Любое изменение требует отдельной дизайн-итерации и согласования

**Если в будущем потребуется адаптировать:**
- Вынести в отдельный PR, не смешивать с другими этапами
- Возможно, новая версия = ExerciseRunner v5, сохранив v4 в `legacy/`
- Провести визуальный regression на всех пациентах dev-окружения перед merge

---

**End of migration plan.**

Следующий шаг после review: решить, какие вопросы из Appendix B блокирующие для старта PR #0, и запустить Этап 0.
