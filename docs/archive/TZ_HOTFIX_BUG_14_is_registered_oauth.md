# TZ Hot-fix · Bug #14 — `is_registered=false` для OAuth-пациентов

**Дата:** 2026-05-12
**Источник:** prod-smoke Wave 0, brief `WAVE_1_ARCHITECT_BRIEF.md`
**Тип:** standalone hot-fix перед Wave 1 (отдельный PR, не часть волны)
**Объём:** 30 минут — 1 час
**Риск:** низкий, только SQL-вычисление computed field

---

## Что блокирует

В таблице `patients` нет физической колонки `is_registered` — это computed поле, формируемое в SELECT'ах для UI инструктора:

```sql
SELECT
  -- ...
  (password_hash IS NOT NULL) AS is_registered
FROM patients
```

Это поле появляется в `routes/patients.js` (минимум в `GET /api/patients` и `GET /api/patients/:id`) и используется в `Patients.js` для индикации «пациент зарегистрировался» в списке.

**Проблема.** После добавления Telegram OAuth (миграция `20260427_oauth_pkce_nonce`) и Yandex OAuth (коммит `7b19e9d`) — пациенты которые залогинились через OAuth провайдер имеют `password_hash IS NULL` (они вообще не задавали пароль). В результате:

- Vadim (id=6) залогинился через Telegram OAuth → `password_hash IS NULL` → `is_registered = false`
- Инструктор смотрит на карточку Vadim'а в Patients и видит «Пациент ещё не зарегистрирован»
- Но в `patients.last_login_at` стоит свежая дата (он реально логинится)

После этого hot-fix'а — `is_registered = true` для OAuth-пациентов тоже.

**Что НЕ делается этим коммитом:**
- Никаких физических колонок в `patients` (computed остаётся computed)
- Никаких изменений в auth-логике, OAuth-флоу, password reset
- Никаких изменений в UI Patients.js (тот же бейдж, только теперь корректно показывается)

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/patients.js` — изменить SELECT в 2-3 местах (всех где `is_registered` вычисляется)
- `backend/tests/__tests__/patients.routes.test.js` — добавить тесты для OAuth-кейса
- (опционально) `CLAUDE.md` секция «Завершённые исправления» — запись про hot-fix

**НЕ ТРОГАТЬ:**
- `backend/routes/patientAuth.js` — OAuth flow, password reset, всё про сессии
- `backend/middleware/auth.js`, `middleware/patientAuth.js`
- Frontend `Patients.js` или `PatientAuthContext` — никаких UI изменений
- Миграции — никаких ALTER TABLE
- Любые routes кроме `patients.js`

---

## Backend — изменение SELECT логики

### Где искать

В `backend/routes/patients.js` найти **все места** где вычисляется `is_registered`. По состоянию на коммит `12a90ad` (последний из Wave 0) минимум 2 точки:

1. `GET /api/patients` (~ строки 30-90, список пациентов)
2. `GET /api/patients/:id` (~ строки 100-150, одна карточка)

Проверить также если есть в `GET /api/patients/trash` (корзина) — там тоже может быть.

### Текущая формула (что заменяем)

```sql
(password_hash IS NOT NULL) AS is_registered
```

### Новая формула

```sql
(password_hash IS NOT NULL OR last_login_at IS NOT NULL) AS is_registered
```

**Логика:** пациент считается «зарегистрированным» если выполнено ХОТЬ ОДНО:
- У него задан пароль (классическая регистрация через email + password) — `password_hash IS NOT NULL`
- ИЛИ он хотя бы раз залогинился (через OAuth) — `last_login_at IS NOT NULL`

`last_login_at` обновляется в обоих типах логина (см. `routes/patientAuth.js` функции `loginPatient`, `oauthCallbackTelegram`, `oauthCallbackYandex`). Это надёжный индикатор «человек реально пользуется».

### Пример замены в `GET /api/patients`

**До:**
```javascript
const result = await query(`
  SELECT
    p.id, p.full_name, p.email, p.phone, p.birth_date,
    p.diagnosis, p.notes, p.avatar_url, p.is_active,
    p.created_at, p.updated_at, p.last_login_at,
    (p.password_hash IS NOT NULL) AS is_registered,
    u.full_name AS created_by_name
  FROM patients p
  LEFT JOIN users u ON p.created_by = u.id
  WHERE p.is_active = $1
  ORDER BY p.created_at DESC
`, [activeFilter]);
```

**После:**
```javascript
const result = await query(`
  SELECT
    p.id, p.full_name, p.email, p.phone, p.birth_date,
    p.diagnosis, p.notes, p.avatar_url, p.is_active,
    p.created_at, p.updated_at, p.last_login_at,
    (p.password_hash IS NOT NULL OR p.last_login_at IS NOT NULL) AS is_registered,
    u.full_name AS created_by_name
  FROM patients p
  LEFT JOIN users u ON p.created_by = u.id
  WHERE p.is_active = $1
  ORDER BY p.created_at DESC
`, [activeFilter]);
```

Аналогично в `GET /api/patients/:id` и любых других местах.

---

## Тесты

### Backend: новые тесты в `backend/tests/__tests__/patients.routes.test.js`

Добавить в существующий `describe('GET /api/patients')` блок новые кейсы:

```javascript
describe('GET /api/patients — is_registered computed field', () => {
  let instructor, instructorToken;

  beforeEach(async () => {
    instructor = await createTestInstructor();
    instructorToken = signToken(instructor.id);
  });

  it('is_registered=true для пациента с password_hash (classic register)', async () => {
    const patient = await createTestPatient({
      full_name: 'Classic User',
      password_hash: '$2b$10$test_bcrypt_hash',
      last_login_at: null
    });

    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    const found = res.body.data.find(p => p.id === patient.id);
    expect(found).toBeDefined();
    expect(found.is_registered).toBe(true);
  });

  it('is_registered=true для OAuth-пациента (NULL password_hash + last_login_at)', async () => {
    const patient = await createTestPatient({
      full_name: 'OAuth User',
      password_hash: null,
      last_login_at: new Date()
    });

    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    const found = res.body.data.find(p => p.id === patient.id);
    expect(found.is_registered).toBe(true);
  });

  it('is_registered=false для пациента без пароля и без логинов', async () => {
    const patient = await createTestPatient({
      full_name: 'Never Logged In',
      password_hash: null,
      last_login_at: null
    });

    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    const found = res.body.data.find(p => p.id === patient.id);
    expect(found.is_registered).toBe(false);
  });
});

describe('GET /api/patients/:id — is_registered computed field', () => {
  it('is_registered=true для OAuth-пациента в карточке', async () => {
    const instructor = await createTestInstructor();
    const instructorToken = signToken(instructor.id);
    const patient = await createTestPatient({
      password_hash: null,
      last_login_at: new Date()
    });

    const res = await request(app)
      .get(`/api/patients/${patient.id}`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data.is_registered).toBe(true);
  });
});
```

**Команда запуска:**
```bash
cd backend && npm test -- --testPathPattern=patients.routes
```

Ожидаем зелёные 3 новых теста плюс все существующие.

---

## NOT TOUCH

- Frontend `Patients.js` — НЕ ТРОГАТЬ, UI не меняется
- OAuth логика в `routes/patientAuth.js` — НЕ ТРОГАТЬ, она работает
- `patients.last_login_at` schema — НЕ ТРОГАТЬ, поле есть с миграции `20260408_patient_lockout.sql`
- Любые routes/files за пределами `routes/patients.js` и его тестов

---

## Smoke test (в реальном браузере)

### Сценарий 1 — Vadim (OAuth-пациент) видится как зарегистрированный

1. Войти в инструкторский dashboard: `vadim@azarean.com` / `Test1234`
2. Открыть таб «Пациенты»
3. Найти пациента id=6 «Азаренков Вадим» (привязан через Telegram OAuth)
4. **Ожидаемо:** бейдж/индикатор «зарегистрирован» (зелёный) рядом с именем. До hot-fix'а был красный «не зарегистрирован»

### Сценарий 2 — Test patient (classic register) остался зарегистрированным

1. В том же списке найти пациента id=14 `avi707@mail.ru`
2. **Ожидаемо:** бейдж «зарегистрирован» (как и раньше)

### Сценарий 3 — Свежесозданный пациент без активности — НЕ зарегистрирован

1. Создать тестового пациента через UI (без приглашения, без логина)
2. **Ожидаемо:** бейдж «не зарегистрирован» (как раньше)

---

## Файлы — итоговый чеклист

### Изменить
- `backend/routes/patients.js` — заменить SELECT-формулу в 2-3 местах (grep `password_hash IS NOT NULL`)
- `backend/tests/__tests__/patients.routes.test.js` — +3 тест-кейса (или integrate в существующий describe)

### НЕ ТРОГАТЬ
- Всё остальное

---

## Текст коммита

```
fix(patients): is_registered учитывает OAuth-логины (last_login_at)

OAuth-пациенты (Telegram, Yandex) имеют password_hash IS NULL,
из-за чего computed поле is_registered = false, и инструктор
видит «Пациент ещё не зарегистрирован» даже для активно
пользующихся клиентов.

Логика расширена: is_registered = TRUE если ХОТЬ ОДНО из:
- password_hash IS NOT NULL (classic register)
- last_login_at IS NOT NULL (любой логин, включая OAuth)

Closes Bug #14. Перед Wave 1.
Test: backend +3 кейса
```

---

## Пост-коммит

### Обновить документацию

**`CLAUDE.md`:**
- Секция «Открытые баги» — вычеркнуть Bug #14
- Секция «Завершённые исправления» — добавить запись «Hot-fix 2026-05-12: is_registered учитывает OAuth-логины»

**Memory:**
- `memory/MEMORY.md` — короткая запись «hot-fix is_registered OAuth, перед Wave 1»

---

## Definition of Done

- [ ] SELECT-формула обновлена во всех местах `routes/patients.js`
- [ ] 3 новых теста зелёные, существующие не сломаны
- [ ] Smoke сценарии 1-3 пройдены в dev (на test instructor + 2 пациентах с разными статусами регистрации)
- [ ] Коммит создан с указанным текстом
- [ ] PR открыт на main (отдельно от Wave 1 веток)
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] После merge: ручная проверка на проде my.azarean.ru у Vadim'а → бейдж стал зелёным
- [ ] CLAUDE.md и memory обновлены
- [ ] **Hot-fix полностью закрыт до старта Wave 1 коммит #01** (чтобы не было merge-конфликта в `routes/patients.js` и его тестах)
