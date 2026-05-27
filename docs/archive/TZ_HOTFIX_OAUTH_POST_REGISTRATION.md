# TZ HOTFIX #5 — OAuth callback'и unblock после local-регистрации

**Дата:** 2026-05-15
**Объём:** ~2-3 часа работы (security-sensitive — больше тестов, более тщательно)
**Risk:** MIDDLE — security-sensitive change, расширяем auto-link surface
**Тип:** Hot-fix перед коммерческим запуском пилота
**Архитектурный дизайн:** одобрен 2026-05-15 (см. [memory/bug_oauth_blocked_after_local_registration.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_oauth_blocked_after_local_registration.md))

---

## Контекст

После Wave 1 invite-flow пациент создаётся инструктором через `POST /api/patients` (password_hash=NULL), затем регистрируется по invite-code через `POST /patient-auth/register` с email+password (password_hash != NULL). Через какое-то время пациент кликает «Войти через Telegram/Yandex»:

1. `byProvider` lookup — пусто (никогда не логинился через OAuth)
2. `byPhone` lookup — `WHERE phone = $1 AND password_hash IS NULL` отсекает его → пусто
3. !patient → redirect на `/patient-register?oauth_provider=...&oauth_provider_id=...&phone=...`
4. `/patient-register` требует `invite_code` (старый used) → **тупик**
5. Workaround: только `/forgot-password` если знает email

**Real impact:** каждый пациент после invite-flow в pilot/коммерческом запуске. ~30% хотят OAuth-логин (статистика consumer apps).

**Semantic shift (архитектор):** до invite-flow `password_hash IS NULL` означало «OAuth-only пациент». После invite-flow это перестало быть bijection — у пациента может быть и пароль, и OAuth, оба легитимны.

**Правильная семантика:** «Если existing пациент совпадает с OAuth-identity — логинь его, обнови `last_login_at`. Не создавай дубль. **НЕ трогай password_hash.**»

---

## Verify-step (обязательно перед стартом)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Найти оба callback'а с фильтром
grep -n "password_hash IS NULL" backend/routes/patientAuth.js
# Ожидается ровно 2 совпадения: ~1695 (Telegram) и ~1902 (Yandex).
# Если 0 — кто-то уже починил, остановиться.
# Если 1 — частично исправлено, скоординировать.
# Если 3+ — есть ещё callback (Google? VK?), включить в scope.

# 2. Найти multi-match anti-misroute logic
grep -n "byPhone.rows.length === 1" backend/routes/patientAuth.js
# Ожидается 2 совпадения. ОБЯЗАТЕЛЬНО сохранить.

# 3. Найти UPDATE patients после byPhone match
grep -n "UPDATE patients" backend/routes/patientAuth.js | head -5
# Должны быть UPDATE'ы с auth_provider, provider_id. НИ ОДИН не должен трогать password_hash.

# 4. Тесты — где они
grep -n "password_hash IS NULL" backend/tests/__tests__/oauthCallback.routes.test.js | head -10
# 8+ совпадений (тесты регексят на SQL). Все обновить.

# 5. Audit log проверить структуру
grep -n "OAUTH_AUTOLINK\|OAUTH_LOGIN" backend/routes/patientAuth.js
# 2 INSERT'а в audit_logs. Tests должны это проверять.
```

Если verify-step не сходится — НЕ начинать, разобраться сначала.

---

## Что менять

### Файл 1: `backend/routes/patientAuth.js`

#### 1A — Telegram callback, byPhone query (строка ~1692-1697):

**Before:**
```javascript
const byPhone = await query(
  `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
     FROM patients
    WHERE phone = $1 AND password_hash IS NULL`,
  [phoneNormalized]
);
```

**After:**
```javascript
// Wave 1 hot-fix #5 (2026-05-15): убран фильтр password_hash IS NULL.
// До Wave 1 invite-flow он защищал от misroute, но теперь у пациента
// может быть и password (local-регистрация по коду), и OAuth — оба
// легитимны. Multi-match anti-misroute сохранён через rows.length === 1.
const byPhone = await query(
  `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
     FROM patients
    WHERE phone = $1
      AND is_active = true`,
  [phoneNormalized]
);
```

**Why `AND is_active = true`:** чтобы deactivated пациент НЕ был кандидатом для autolink. Сейчас проверка `is_active === false` после autolink даёт fail, но лучше отфильтровать на SQL-level — экономит UPDATE patients для disabled аккаунтов и устраняет временный artefact.

#### 1B — Telegram callback, email-match fallback (после byPhone, перед `if (!patient)`):

В Telegram OIDC `claims.email` обычно пустой (BotFather scope `email` опциональный, юзеры обычно не дают). Поэтому email-match для Telegram — **decorative fallback**, но логически правильный для consistency с Yandex.

**Вставить ПОСЛЕ блока `if (byPhone.rows.length === 1) { ... }`, ПЕРЕД `if (!patient) {`** (строка ~1719):

```javascript
} // конец `} else if (phoneNormalized) {`

// Email-match fallback: если phone не дал результата (или phone не пришёл).
// Telegram OIDC обычно НЕ возвращает email, но логика для consistency.
if (!patient && claims.email) {
  const emailNormalized = String(claims.email).toLowerCase().trim();
  const byEmail = await query(
    `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
       FROM patients
      WHERE LOWER(email) = $1
        AND is_active = true`,
    [emailNormalized]
  );

  if (byEmail.rows.length === 1) {
    const candidate = byEmail.rows[0];
    await query(
      `UPDATE patients
          SET auth_provider = 'telegram',
              provider_id = $1,
              telegram_chat_id = $2,
              avatar_url = COALESCE(avatar_url, $3),
              email_verified = true,
              last_login_at = NOW()
        WHERE id = $4`,
      [providerId, providerId, avatarUrl, candidate.id]
    );
    patient = { ...candidate, auth_provider: 'telegram' };
    linkType = 'email_autolink';
  }
}
```

**Note:** `claims.email` нужно проверить — у `telegramOidc.js` он называется `email` или `email_address`? Verify-step:
```bash
grep -n "claims\." backend/services/telegramOidc.js
grep -n "email\|verified_email" backend/services/telegramOidc.js
```

Если в Telegram-сервисе нет email в claims — пропустить весь блок 1B (это OK, decorative fallback). Архитектор подтвердил: «Telegram OIDC обычно НЕ возвращает email».

#### 1C — Yandex callback, byPhone query (строка ~1899-1904):

**Before:**
```javascript
const byPhone = await query(
  `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
     FROM patients
    WHERE phone = $1 AND password_hash IS NULL`,
  [phoneNormalized]
);
```

**After:** идентичен 1A — `phone = $1 AND is_active = true`.

#### 1D — Yandex callback, email-match fallback:

Yandex **всегда** возвращает email (scope `login:email`). Это важный fallback (e.g. юзер сменил телефон в Yandex, но email тот же).

**Вставить аналогично 1B**, после `if (byPhone.rows.length === 1) { ... }`, перед `if (!patient) {` (строка ~1925):

```javascript
} // конец `} else if (phoneNormalized) {`

// Email-match fallback. Yandex всегда возвращает email (scope login:email).
if (!patient && claims.email) {
  const emailNormalized = String(claims.email).toLowerCase().trim();
  const byEmail = await query(
    `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
       FROM patients
      WHERE LOWER(email) = $1
        AND is_active = true`,
    [emailNormalized]
  );

  if (byEmail.rows.length === 1) {
    const candidate = byEmail.rows[0];
    await query(
      `UPDATE patients
          SET auth_provider = 'yandex',
              provider_id = $1,
              avatar_url = COALESCE(avatar_url, $2),
              email_verified = true,
              last_login_at = NOW()
        WHERE id = $3`,
      [providerId, claims.avatarUrl, candidate.id]
    );
    patient = { ...candidate, auth_provider: 'yandex' };
    linkType = 'email_autolink';
  }
}
```

#### 1E — Audit log: расширить linkType handling

В обоих callback'ах есть строка:
```javascript
linkType === 'phone_autolink' ? 'OAUTH_AUTOLINK' : 'OAUTH_LOGIN',
```

**Заменить на:**
```javascript
(linkType === 'phone_autolink' || linkType === 'email_autolink') ? 'OAUTH_AUTOLINK' : 'OAUTH_LOGIN',
```

И в `details` JSON добавить:
```javascript
JSON.stringify({ provider: 'telegram', method: 'oidc', link_type: linkType, has_phone: !!phoneNormalized })
```

Это позволит retrospective отслеживать какой тип autolink сработал (phone vs email).

#### 1F — НЕ обновлять password_hash при OAuth — verify

Просмотреть оба `UPDATE patients` блока (autolink + email-autolink + returning). Убедиться что НИ ОДИН не упоминает `password_hash`. Если упоминает — это bug, удалить.

**Проверка grep'ом:**
```bash
grep -B 2 -A 10 "UPDATE patients" backend/routes/patientAuth.js | grep -i password_hash
# Должно быть пусто.
```

---

## Файл 2: `backend/tests/__tests__/oauthCallback.routes.test.js`

### 2A — Обновить existing test 2 (Phone-autolink single match)

**Семантика та же:** phone matches, autolink происходит. Но regex проверки SQL надо обновить — больше нет `password_hash IS NULL`.

**Find:**
```javascript
[/phone = \$1 AND password_hash IS NULL/i, {
  rows: [{
    id: 14, email: null, full_name: 'Вадим', phone: '+79001234567', ...
  }],
}],
```

**Replace:**
```javascript
[/phone = \$1[\s\S]*AND is_active = true/i, {
  rows: [{
    id: 14, email: null, full_name: 'Вадим', phone: '+79001234567', is_active: true,
  }],
}],
```

Test описание оставить, но добавить комментарий:
```javascript
test('2) Phone-autolink: single match → autolink + audit OAUTH_AUTOLINK', async () => {
  // После Wave 1 hot-fix #5: фильтр `password_hash IS NULL` убран.
  // Phone-match теперь срабатывает для local-registered пациентов тоже.
```

### 2B — Test 3 (no match) — обновить regex

```javascript
[/phone = \$1[\s\S]*AND is_active = true/i, { rows: [] }],
```

### 2C — Test 4 (multi-match anti-misroute) — обновить regex + добавить более конкретный assert

```javascript
[/phone = \$1[\s\S]*AND is_active = true/i, {
  rows: [
    { id: 10, email: null, full_name: 'Родитель', phone: '+79001234567', is_active: true },
    { id: 11, email: null, full_name: 'Ребёнок', phone: '+79001234567', is_active: true },
  ],
}],
```

**Дополнительно проверить** что в SQL НЕТ `password_hash IS NULL`:
```javascript
const phoneSelectCall = query.mock.calls.find(([sql]) =>
  /phone = \$1[\s\S]*AND is_active = true/i.test(sql)
);
expect(phoneSelectCall).toBeDefined();
expect(phoneSelectCall[0]).not.toMatch(/password_hash IS NULL/i); // Wave 1 hot-fix #5
```

### 2D — Test 5 (СЕМАНТИКА МЕНЯЕТСЯ!) — переписать

**Старая семантика:** «Phone-match с claimed account (password_hash IS NOT NULL) → НЕ сматчит» (фильтр в SQL отсёк).

**Новая семантика после hot-fix #5:** «Phone-match с password-protected account → ТЕПЕРЬ autolink (invite-flow allows multi-auth)».

**Полностью переписать тест:**

```javascript
test('5) Phone-match с password-protected account → autolink (Wave 1 invite-flow allows multi-auth, hot-fix #5)', async () => {
  // До hot-fix #5 фильтр `password_hash IS NULL` блокировал автолинк для
  // пациентов прошедших invite-flow. После #5 — pгасplitение auth methods:
  // у пациента может быть и password, и OAuth — оба легитимны.
  // password_hash при OAuth-логине НЕ затирается.
  const client = makeMockClient();
  wireStateClient(client, validStateRow());
  getClient.mockResolvedValue(client);
  setTelegramClaims();

  let auditAction = null;
  let updatePasswordHashTouched = false;
  routeQueries([
    [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
    [/phone = \$1[\s\S]*AND is_active = true/i, {
      rows: [{
        id: 14,
        email: 'patient@example.com',
        full_name: 'Вадим (password-protected)',
        phone: '+79001234567',
        is_active: true,
        // password_hash есть, но запрос его не SELECT'ит — это нормально
      }],
    }],
    [/UPDATE patients[\s\S]*password_hash/i, (sql) => {
      updatePasswordHashTouched = true;
      return { rows: [] };
    }],
    [/UPDATE patients/i, { rows: [] }],
    [/INSERT INTO audit_logs/i, (sql, params) => {
      auditAction = params[0];
      return { rows: [] };
    }],
  ]);

  const res = await request(app)
    .get('/api/patient-auth/oauth/telegram/callback')
    .query({ state: 'fake-state', code: 'fake-code' });

  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/patient-dashboard');
  expect(auditAction).toBe('OAUTH_AUTOLINK');
  expect(updatePasswordHashTouched).toBe(false); // password_hash сохранён
});
```

### 2E — Test 8 (state expired), Test 9 (deactivated): обновить regex

Деактивированный аккаунт теперь отсеивается на SQL-уровне (`AND is_active = true`), поэтому **test 9 семантика меняется**: byPhone SELECT возвращает 0 rows (а не is_active=false patient).

Переписать test 9 если он был «провёл UPDATE и потом fail по is_active=false»:

```javascript
test('9) Phone match с deactivated patient → SQL фильтрует, fallback на /patient-register', async () => {
  // После hot-fix #5: фильтр `AND is_active = true` в SQL.
  // Deactivated пациент даже не попадает в кандидаты autolink.
  ...
});
```

### 2F — Yandex-секция: применить 2A-2E аналогично (тесты 10-15 примерно)

### 2G — НОВЫЕ ТЕСТЫ (4 шт.)

**Test NEW-1: Telegram phone-autolink для password-protected пациента (post invite-flow)**

```javascript
test('NEW: Phone-autolink для local-registered пациента (Wave 1 invite-flow)', async () => {
  // Пациент: создан инструктором, прошёл invite-flow, имеет password_hash.
  // Сейчас впервые кликает «Войти через Telegram».
  // Ожидание: phone match → autolink → OAUTH_AUTOLINK audit → /patient-dashboard.
  // НЕ password_hash в UPDATE.
  ...
});
```

**Test NEW-2: Yandex email-autolink fallback**

```javascript
test('NEW: Email-autolink fallback в Yandex callback (phone не совпал)', async () => {
  // Yandex вернул email который совпадает с пациентом, но phone в Yandex
  // другой / отсутствует.
  // Ожидание: byPhone → 0 rows, byEmail → 1 row, autolink, link_type='email_autolink'
  setYandexClaims({ phone: null, email: 'patient@example.com' });

  routeQueries([
    [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
    [/LOWER\(email\) = \$1[\s\S]*AND is_active = true/i, {
      rows: [{ id: 20, email: 'patient@example.com', full_name: 'Иван', is_active: true }],
    }],
    [/UPDATE patients/i, { rows: [] }],
    [/INSERT INTO audit_logs/i, (sql, params) => {
      expect(params[0]).toBe('OAUTH_AUTOLINK');
      const details = JSON.parse(params[5]);
      expect(details.link_type).toBe('email_autolink');
      return { rows: [] };
    }],
  ]);

  ...
});
```

**Test NEW-3: Email-multi-match anti-misroute**

```javascript
test('NEW: Email-match multi (2 пациента с одним email) → НЕ autolink, redirect register', async () => {
  // Email coincidence — два разных пациента (legacy data, family share email).
  // Ожидание: byEmail.rows.length === 2 → НЕ autolink → /patient-register с pre-fill.
  ...
});
```

**Test NEW-4: Email-match с claimed аккаунтом, phone в Yandex другой**

```javascript
test('NEW: Email-match для password-protected — autolink (anti-misroute через is_active=true)', async () => {
  // Защита проходит через is_active=true в SQL + single match через rows.length === 1.
  // Не через password_hash.
  ...
});
```

---

## Тесты — статистика

- Backend: ожидаем **429 → ~438** (+8-10):
  - 4 existing test обновить (Telegram/Yandex × phone-autolink/no-match/multi-match/claimed)
  - 4 НОВЫХ test (Telegram phone-autolink post-invite, Yandex email-autolink, email-multi anti-misroute, email-match password-protected)
  - Возможно ещё 1-2 deactivated test обновить
- Frontend: 252/252 не меняется
- 0 миграций

---

## Smoke test (после merge)

### Сценарий 1 — Regression check: returning OAuth login

1. Залогиниться в проде как Vadim (`avi707@mail.ru`) через **Yandex**
2. Должен попасть на dashboard как раньше (returning login, не autolink)

### Сценарий 2 — Post-invite OAuth autolink (НОВЫЙ flow закрывает Bug #5)

**Подготовка (dev БД):**
```sql
-- Создать тестового пациента с password_hash и phone
-- (имитация invite-flow завершённого пациента)
INSERT INTO patients (full_name, phone, password_hash, is_active, created_by, auth_provider)
VALUES ('Тест Hot-fix #5', '+79009876543', '$2a$10$dummyhashforTest1234', true, 1, 'local');
```

**Сам смок:**
1. Залогиниться через Yandex с аккаунтом который имеет phone `+79009876543` и не привязан к этому пациенту
2. Должен попасть на dashboard (НЕ на /patient-register)
3. Проверить audit:
   ```sql
   SELECT action, details FROM audit_logs
   WHERE entity_id = (SELECT id FROM patients WHERE phone = '+79009876543')
   ORDER BY created_at DESC LIMIT 1;
   ```
   Должен быть `OAUTH_AUTOLINK` с `details.link_type = 'phone_autolink'`
4. **Critical:** проверить что `password_hash` НЕ затёрся:
   ```sql
   SELECT password_hash FROM patients WHERE phone = '+79009876543';
   ```
   Должен остаться оригинальный hash. Local-login `Test1234` должен по-прежнему работать.

**Cleanup:**
```sql
DELETE FROM patients WHERE phone = '+79009876543';
```

### Сценарий 3 — Multi-match anti-misroute (регрессия не должна сломаться)

1. Создать 2 тестовых пациента с одним phone (родитель+ребёнок)
2. Залогиниться через OAuth с тем же phone
3. Должен попасть на /patient-register, НЕ на dashboard

### Сценарий 4 — Email-autolink fallback (Yandex)

1. Создать тестового пациента: phone NULL, email `test-hotfix5@example.com`, password_hash NULL
2. Привязать Yandex-аккаунт с этим email и phone не указан
3. Залогиниться через Yandex
4. Должен попасть на dashboard, audit `OAUTH_AUTOLINK` с `link_type = 'email_autolink'`

---

## Definition of Done

- [ ] Verify-step grep'ом 5 проверок (см. выше) — все 5 проходят
- [ ] 1A: Telegram byPhone — фильтр `password_hash IS NULL` убран, добавлен `is_active = true`
- [ ] 1B: Telegram email-fallback вставлен (если `claims.email` есть в Telegram OIDC сервисе)
- [ ] 1C: Yandex byPhone — то же
- [ ] 1D: Yandex email-fallback вставлен
- [ ] 1E: Audit log handles `email_autolink` linkType
- [ ] 1F: Verify grep'ом что `UPDATE patients` НИ В ОДНОМ месте не трогает `password_hash`
- [ ] 2A-2F: 4-6 existing тестов обновлены (regex + comment)
- [ ] 2G: 4 новых теста добавлены
- [ ] `npx jest --forceExit --testPathPatterns=oauthCallback` зелёный
- [ ] Полный backend `npx jest --forceExit` зелёный, 429 → ~438
- [ ] Smoke сценарии 1-4 пройдены вручную после deploy
- [ ] Commit на ветке `hotfix/oauth-post-registration` от main
- [ ] Mini-PR с подробным body описанием security-anti-attack таблицы
- [ ] После merge — обновить memory `bug_oauth_blocked_after_local_registration.md` пометкой closed + SHA
- [ ] Обновить CLAUDE.md секцию «Открытые баги и тех-долг» — Bug #5 переоформить как closed
- [ ] Архитектор review перед merge — security-sensitive change

---

## Security checklist (архитектор) — проверить ДО merge

| Атака | Защита в этом fix'е |
|---|---|
| Третье лицо имеет тот же phone в Yandex-аккаунте | Yandex провайдер уже верифицировал владение account'ом (эквивалент SMS-OTP). Acceptable risk. |
| Захват password-protected аккаунта через OAuth | `password_hash` НЕ обновляется/удаляется при OAuth-логине → классический login остаётся работающим. Пациент видит «вход через Telegram/Yandex» в audit log. |
| Email coincidence (разные пациенты с одинаковым email) | `if rows.length === 1` блокирует, redirect на manual register с pre-fill. |
| Email coincidence + claimed account | То же — single match блокирует. |
| Phone reassignment (новый владелец номера) | OAuth-provider верифицировал текущее владение phone. Защита от reassignment — работа провайдера, не нас. |
| Deactivated пациент через autolink | `AND is_active = true` в SQL отсеивает на уровне БД. |
| Inactive пациент через email-match | То же. |
| OAuth user provides email of other patient (phishing attempt) | Phone-match имеет приоритет → email-match только fallback. И всё ещё single-match validation. |

---

## Commit message

```
fix(oauth): unblock post-registration OAuth для invite-flow пациентов (Bug #5)

После Wave 1 invite-flow пациент имеет и password_hash, и phone. Старый
фильтр `WHERE phone = $1 AND password_hash IS NULL` блокировал OAuth-autolink
для local-registered пациентов → они попадали в тупик при попытке войти
через Yandex/Telegram (invite-code used, /patient-register requires новый
код, /forgot-password требует email).

Security shift (одобрен архитектором 2026-05-15): семантика `password_hash`
больше не bijection с auth method. Пациент может иметь и пароль, и OAuth
одновременно — оба легитимны.

Changes:
- routes/patientAuth.js — оба callback'а:
  * byPhone: убран `password_hash IS NULL`, добавлен `is_active = true`
  * email-match fallback после byPhone (Yandex использует, Telegram опционально)
  * НЕ обновляем password_hash в UPDATE (classical login остаётся работать)
  * audit_logs.details.link_type для tracking (phone_autolink/email_autolink/returning)

Tests:
- 4-6 existing test обновлены под новый regex
- 4 НОВЫХ test (phone-autolink post-invite, email-autolink fallback,
  email-multi anti-misroute, email-match password-protected)
- Backend 429 → ~438

Smoke сценарии (4) задокументированы — проверить после deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## NOT TOUCH

- **LOCKED:** ExerciseRunner — нет связи
- **Dark-theme dirty файлы:** изоляция через `git stash` перед стартом, restore после
- **Wave 1 миграции:** не трогать (program_types, program_templates, phase_stuck_alerts)
- **OAuth services (telegramOidc.js, yandexOauth.js):** не трогать — только match-flow в patientAuth.js
- **patient_oauth_states schema:** не менять
- **password_hash UPDATE:** ЯВНО НЕ ДОБАВЛЯТЬ в OAuth flow (опасный backdoor)
- **`COALESCE` фильтр**: `(SELECT auth_provider, password_hash, ...)` — НЕ читать password_hash в SELECT'ах (не нужно для логики, лишний leak surface)

---

## Связано

- [memory/bug_oauth_blocked_after_local_registration.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_oauth_blocked_after_local_registration.md) — дизайн архитектора + security-таблица
- [memory/telegram_oidc_proxy.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/telegram_oidc_proxy.md) — оригинальная реализация Telegram OIDC
- [memory/yandex_oauth_v2.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/yandex_oauth_v2.md) — оригинальная реализация Yandex
- Bug #14 (`52631a2`) — родственный по теме (`is_registered` в /patients SELECT'ах), но не связан с auth-flow
- [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md) — применить к этому hot-fix'у: grep `password_hash IS NULL` после fix'а должен дать 0 совпадений в routes (только в тестах, и то — в негативных asserts)

---

## После merge — follow-up tasks

1. **Optional new field** `last_login_method VARCHAR(20)` для security audit. Архитектор сказал «можно отложить». Если решим — отдельной миграцией + UPDATE в каждом callback'е.
2. **Google/VK OAuth** (TODO в CLAUDE.md) — когда реализуем, **СРАЗУ** применить тот же pattern (без `password_hash IS NULL`, с email-fallback). Записать в [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md) как пример «новые OAuth провайдеры тоже проверять».
3. **OAuth disconnection UI** (Wave 2+) — пациент может отвязать Yandex/Telegram через Profile screen, если хочет. Сейчас этого нет. Backlog item.
