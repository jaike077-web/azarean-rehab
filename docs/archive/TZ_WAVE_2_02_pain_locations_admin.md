# TZ Wave 2 · Коммит 2.02 — Pain locations seed + AdminContent → PainLocationsTab inline CRUD

**Дата:** 2026-05-16
**Версия:** v2 (обновлено после Wave 2 Readiness Check 2026-05-16)
**Roadmap:** PATIENT_UX_ROADMAP_2026-05-08_v2.md Волна 2 + clinical foundation 2026-05-13—16
**Цель:** Заполнить справочник `pain_locations` 16 записями (8 knee + 8 shoulder, 2 red-flag), добавить admin endpoints CRUD в `routes/admin.js` и 6-ю вкладку `PainLocationsTab` в `AdminContent.js` (inline pattern по образцу `ProgramTypesTab`). После этого коммита Vadim может ревьювить/редактировать локации через UI, и patient-facing endpoint в 2.04 будет читать готовые данные.
**Объём:** 4-5 часов
**Риск:** низкий — additive seed + admin CRUD + новая inline вкладка. Не трогает pain_entries (это в 2.04).

**Изменения v2 (после readiness check):**
- ✅ Подтверждены коды `program_types`: `acl` (knee) + `shoulder_general` — seed работает as-is
- 🔧 CSS Modules alias — `s` (НЕ `styles`); `import s from './AdminContent.module.css'`
- 🔧 Audit logging — через **существующий** helper `logAudit(req, action, entityType, entityId, details)` из `admin.js:17`, **не inline INSERT**
- 🔧 api.js — verify-driven: Claude Code смотрит как `ProgramTypesTab` вызывает admin endpoints и копирует тот же паттерн (нет `xxxAdmin = {...}` namespace в существующем коде)
- 📝 Backlog hot-fix #6: добавить logAudit в Wave 1 program-types/program-templates endpoints (отдельный мини-TZ)

---

## Verify-step перед стартом (правило 2026-05-13)

**Обновлено 2026-05-16 после Wave 2 Readiness Check** — фактическое состояние кода зафиксировано в отчёте. Этот verify-step минимизирован: главное — убедиться что premise drift из readiness check'а актуален.

**Обязательно сделай grep до начала кода:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) Подтвердить что 2.01 уже применён: pain_locations таблица существует и пуста
psql -U postgres -d azarean_rehab -c "\d pain_locations"
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM pain_locations;"
# Ожидание (после 2.01): таблица есть, COUNT = 0
# Если таблицы нет — СТОП, 2.01 не применён, не продолжать

# 2) Подтвердить коды program_types (readiness check 2026-05-16 показал: acl + knee_general + shoulder_general)
psql -U postgres -d azarean_rehab -c "SELECT code, label, is_active FROM program_types WHERE is_active = TRUE ORDER BY code;"
# Ожидание: 'acl', 'knee_general', 'shoulder_general' (это что было на 2026-05-16)
# Если коды поменялись — СТОП, скажи архитектору, поправит seed

# 3) AdminContent.js — паттерн CSS Modules + inline tabs (зафиксировано из readiness check)
#    Известно: 1242 строки, alias `s` (не `styles`), 5 tab-компонентов inline (PhasesTab/TipsTab/VideosTab/ProgramTypesTab/ProgramTemplatesTab)
#    Tab keys — kebab-case: 'phases', 'tips', 'videos', 'program-types', 'program-templates'
grep -n "^import s from" frontend/src/pages/Admin/AdminContent.js
grep -n "function ProgramTypesTab\|function ProgramTemplatesTab" frontend/src/pages/Admin/AdminContent.js
grep -n "tab === '" frontend/src/pages/Admin/AdminContent.js | head -10
# Ожидание: видна структура, готовы копировать pattern 1:1

# 4) КРИТИЧНО: как ProgramTypesTab вызывает свои admin endpoints?
#    Readiness check показал что в api.js НЕТ паттерна xxxAdmin = { list, get, create, ... }
#    Нужно подсмотреть как реально устроено — функции в api.js или inline api.get/post в компоненте
grep -n "program-types\|programTypes\|/admin/program" frontend/src/services/api.js
grep -n "api\.\(get\|post\|put\|delete\)" frontend/src/pages/Admin/AdminContent.js | head -20
# Ожидание: найдём паттерн. ВАЖНО: для pain_locations используем ТОТ ЖЕ паттерн, не изобретаем новый
# Если в api.js функции типа listProgramTypes/createProgramType — делаем listPainLocations/...
# Если inline api.get('/admin/program-types') в компоненте — делаем inline для pain_locations

# 5) logAudit helper — существует в admin.js:17 (зафиксировано readiness check)
grep -n "function logAudit\|await logAudit" backend/routes/admin.js | head -10
# Ожидание: function logAudit(req, action, entityType, entityId, details) — используем её, НЕ inline INSERT

# 6) Подтвердить что pain_locations ещё не имеет endpoints/UI (артефакты)
grep -rn "pain_locations\|/pain-locations\|painLocation" backend/routes/ frontend/src/ 2>/dev/null
# Ожидание: 0 совпадений — мы первые трогаем

# 7) admin.routes.test.js — паттерн describe-блоков
grep -n "describe(" backend/tests/__tests__/admin.routes.test.js | head -10
# Ожидание: видны существующие describe-блоки, добавляем новый в конце
```

**Зачем (после readiness check):**
- Подтвердить что 2.01 применён (без него — seed упадёт с relation does not exist)
- Подтвердить что program_types коды не сместились с момента readiness check
- Найти **точный паттерн** вызова admin endpoints из frontend (api.js функции vs inline) — копируем 1:1
- Использовать **существующий** logAudit helper, не вводить новый паттерн

**Если grep покажет что:**
- 2.01 не применён → СТОП. Сначала 2.01.
- Коды `program_types` отличаются от `acl`/`shoulder_general` → СТОП, архитектор поправит seed
- Паттерн вызова admin endpoints из frontend не считывается однозначно → СТОП, попроси архитектора посмотреть и решить
- Есть какие-то существующие endpoints/код связанные с `pain_locations` → СТОП (артефакт)

---

## Зависимости

После 2.01 (schema) в feature-ветке или main. Ветка `wave-2/02-pain-locations` от `wave-2/01-schema-migrations` (или от main если 2.01 уже смерджен — но **batch merge policy** — все PRs Wave 2 висят открытыми до конца волны).

Wave 1 hot-fixes #1 (AdminContent CSS Modules) **желательно закрыт до 2.02**, чтобы не выбирать стиль вслепую. Но не блокер — если #1 не закрыт, продолжаем существующий стиль AdminContent.

---

## Что блокирует

- 2.04 (Backend pain endpoints) — ему нужны записи в `pain_locations` чтобы validate `location_code` при создании `pain_entries`. Без seed валидация будет всегда fail.
- 2.05 (Frontend DiaryScreen + PainEventForm) — ему нужен public GET endpoint для locations multi-select. Public endpoint добавляется в 2.04 поверх данных из 2.02.
- 2.13 (Roadmap stuck v2) — не зависит напрямую, но criteria evaluator в 2.11 может ссылаться на pain location codes для специфичных criteria.

Без 2.02 вся pain-tracking ветка Wave 2 (2.04-2.05) — слепая.

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что делаем |
|---|---|
| `backend/database/migrations/20260517_pain_locations_seed.sql` | НОВЫЙ — 16 idempotent INSERTs |
| `backend/database/seeds/pain_locations.sql` | UPDATE — replace placeholder (2.01) на ту же копию INSERTs + comment header |
| `backend/routes/admin.js` | EXTEND — добавить ~120 строк: GET/POST/PUT/DELETE `/pain-locations` + audit |
| `backend/tests/__tests__/admin.routes.test.js` | EXTEND — добавить `describe('pain_locations CRUD')` блок (~10 тестов) |
| `frontend/src/services/api.js` | EXTEND — добавить `painLocationsAdmin` helpers (~30 строк) |
| `frontend/src/pages/Admin/AdminContent.js` | EXTEND — добавить 6-ю вкладку `PainLocationsTab` inline (~200 строк) |
| `frontend/src/pages/Admin/AdminPanel.test.js` | EXTEND — добавить тесты для PainLocationsTab (~6-8 тестов) |
| `CLAUDE.md` | UPDATE — добавить migration в список, новые admin endpoints в таблицу |

**НЕ ТРОГАТЬ:**

- Любые существующие admin endpoints/табы (Phases, Tips, Videos, ProgramTypes, ProgramTemplates — все inline в AdminContent.js)
- `routes/rehab.js` — public pain locations endpoint в 2.04, не здесь
- `pain_entries` / `pain_entry_locations` таблицы — это 2.04
- Patient frontend (`PatientDashboard/`) — pain UI в 2.05
- Любые LOCKED-зоны (ExerciseRunner, OAuth flow, PatientDashboard `pd-*` стили)
- 4 dirty dark-theme файлов от 2026-05-04

---

## Конкретная реализация

### A) Миграция-seed: `backend/database/migrations/20260517_pain_locations_seed.sql`

**Паттерн:** идемпотентные INSERT'ы с `ON CONFLICT (code) DO NOTHING`. Это означает что:
- Первый run на dev/prod — заполняет 16 записей.
- Повторный run — пропускает, не перезаписывает (если Vadim что-то отредактировал через UI — изменения сохраняются).
- Не использует `ON CONFLICT UPDATE` намеренно: после initial seed Vadim — источник истины.

```sql
-- Wave 2 коммит 2.02 — seed pain_locations
-- 16 локаций (8 knee + 8 shoulder), 2 red-flag (calf_posterior DVT, neck_lateral radiculopathy)
-- Идемпотентно: ON CONFLICT DO NOTHING — повторный запуск безопасен, не перетирает ручные правки

BEGIN;

-- ================================================================
-- KNEE (program_type зависит от реального кода в program_types)
-- ВНИМАНИЕ для Claude Code: если verify-step показал что код knee-программы
-- называется иначе чем 'acl' (например 'knee_acl') — замени все 'acl' ниже
-- на актуальный код ДО применения миграции.
-- ================================================================

INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason)
VALUES
  ('knee_anterior',           'acl', 'Передняя поверхность колена',                      10, FALSE, NULL),
  ('knee_posterior',          'acl', 'Задняя поверхность колена (подколенная ямка)',     20, FALSE, NULL),
  ('knee_medial',             'acl', 'Внутренняя поверхность колена',                    30, FALSE, NULL),
  ('knee_lateral',            'acl', 'Наружная поверхность колена',                      40, FALSE, NULL),
  ('knee_inferior_patellar',  'acl', 'Под надколенником (нижний полюс)',                 50, FALSE, NULL),
  ('knee_superior_patellar',  'acl', 'Над надколенником (сухожилие квадрицепса)',        60, FALSE, NULL),
  ('tibia_anterior',          'acl', 'Передняя поверхность голени',                      70, FALSE, NULL),
  ('calf_posterior',          'acl', 'Икроножная мышца (задняя поверхность голени)',     80, TRUE,
   'Возможный тромбоз глубоких вен (ТГВ). Срочно консультация куратора, ультразвук вен.')
ON CONFLICT (code) DO NOTHING;

-- ================================================================
-- SHOULDER (program_type='shoulder_general' — verify-step подтверждает код)
-- ================================================================

INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason)
VALUES
  ('shoulder_anterior',  'shoulder_general', 'Передняя поверхность плеча',                  10, FALSE, NULL),
  ('shoulder_lateral',   'shoulder_general', 'Боковая поверхность плеча (область дельтовидной мышцы)', 20, FALSE, NULL),
  ('shoulder_posterior', 'shoulder_general', 'Задняя поверхность плеча',                    30, FALSE, NULL),
  ('shoulder_superior',  'shoulder_general', 'Верхушка плеча (область надостной мышцы)',    40, FALSE, NULL),
  ('arm_anterior',       'shoulder_general', 'Передняя поверхность плечевой кости (бицепс)', 50, FALSE, NULL),
  ('arm_posterior',      'shoulder_general', 'Задняя поверхность плечевой кости (трицепс)',  60, FALSE, NULL),
  ('neck_lateral',       'shoulder_general', 'Боковая поверхность шеи',                     70, TRUE,
   'Возможная цервикальная радикулопатия. Срочно консультация куратора, неврологический осмотр.'),
  ('scapula_medial',     'shoulder_general', 'Внутренний край лопатки',                     80, FALSE, NULL)
ON CONFLICT (code) DO NOTHING;

COMMIT;
```

**Замечание для Vadim'а (опционально):** русские формулировки — клинически нейтральные placeholder'ы. Через PainLocationsTab UI можно отредактировать на язык, понятный пациенту (например «передняя часть колена под чашечкой» вместо «нижний полюс надколенника»). Менять можно в любой момент — `code` остаётся стабильным FK, меняем только `label`.

### B) Зеркальный seed-файл: `backend/database/seeds/pain_locations.sql`

В 2.01 был создан placeholder. В 2.02 заменяем содержимым миграции выше (одно к одному, для dev-удобства / документации).

```sql
-- Pain locations seed (dev convenience / документация)
-- АВТОРИТЕТНАЯ копия — backend/database/migrations/20260517_pain_locations_seed.sql
-- Этот файл — для ручного применения на dev (psql -f) или для clinical review.
-- При расхождениях миграция — источник истины.

[ТОТ ЖЕ КОНТЕНТ что в migration 20260517_pain_locations_seed.sql]
```

### C) Backend endpoints в `routes/admin.js`

**Паттерн:** mirror того, как сделаны `/phases`, `/tips`, `/videos` (см. verify-step grep).

**Все эндпоинты:** `authenticateToken` + `requireAdmin` (как все admin).

**Audit logging:** через существующий helper `logAudit(req, action, entityType, entityId, details)` из `admin.js:17`. **НЕ inline INSERT INTO audit_logs** — readiness check 2026-05-16 подтвердил наличие helper'а. Используем его для consistency.

> **Замечание (backlog):** Wave 1 endpoints `program-types` и `program-templates` не используют `logAudit` — это технический долг (hot-fix #6, отдельный мини-TZ). В 2.02 для pain_locations начинаем правильный паттерн с нуля.

```javascript
// === Pain Locations (Wave 2 коммит 2.02) ===

/**
 * GET /api/admin/pain-locations
 * Список всех локаций боли (опц. фильтр по program_type, is_active).
 * Query params: program_type (string), is_active (boolean, default — все)
 */
router.get('/pain-locations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { program_type, is_active } = req.query;
    const conditions = [];
    const params = [];

    if (program_type) {
      params.push(program_type);
      conditions.push(`pl.program_type = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true' || is_active === true);
      conditions.push(`pl.is_active = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT pl.code, pl.program_type, pt.name AS program_type_name,
             pl.label, pl.position, pl.is_red_flag, pl.red_flag_reason,
             pl.is_active, pl.created_at, pl.updated_at
      FROM pain_locations pl
      LEFT JOIN program_types pt ON pt.code = pl.program_type
      ${whereClause}
      ORDER BY pl.program_type, pl.position, pl.code
    `;
    const { rows } = await query(sql, params);
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /admin/pain-locations error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить локации боли' });
  }
});

/**
 * GET /api/admin/pain-locations/:code
 * Одна локация (для edit form load).
 */
router.get('/pain-locations/:code', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const { rows } = await query(
      `SELECT pl.code, pl.program_type, pt.name AS program_type_name,
              pl.label, pl.position, pl.is_red_flag, pl.red_flag_reason,
              pl.is_active, pl.created_at, pl.updated_at
       FROM pain_locations pl
       LEFT JOIN program_types pt ON pt.code = pl.program_type
       WHERE pl.code = $1`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Локация не найдена' });
    }
    return res.json({ data: rows[0] });
  } catch (err) {
    console.error('GET /admin/pain-locations/:code error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить локацию' });
  }
});

/**
 * POST /api/admin/pain-locations
 * Создать новую локацию.
 * Body: { code, program_type, label, position?, is_red_flag?, red_flag_reason? }
 */
router.post('/pain-locations', authenticateToken, requireAdmin, async (req, res) => {
  const { code, program_type, label, position, is_red_flag, red_flag_reason } = req.body;

  // Валидация
  if (!code || typeof code !== 'string' || !/^[a-z_]+$/.test(code) || code.length > 50) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'code обязателен, latin lowercase + underscore, до 50 символов'
    });
  }
  if (!program_type || !label || label.length > 100) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'program_type и label (≤100 символов) обязательны'
    });
  }
  if (is_red_flag && (!red_flag_reason || red_flag_reason.length > 255)) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Для red-flag локации red_flag_reason обязателен (≤255 символов)'
    });
  }

  try {
    // Проверка существования program_type
    const ptCheck = await query('SELECT code FROM program_types WHERE code = $1', [program_type]);
    if (ptCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: `program_type "${program_type}" не существует`
      });
    }

    const { rows } = await query(
      `INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING *`,
      [code, program_type, label, position ?? 0, !!is_red_flag, is_red_flag ? red_flag_reason : null]
    );

    // Audit log
    await logAudit(req, 'create', 'pain_location', null, {
      code, program_type, label, is_red_flag: !!is_red_flag
    });

    return res.status(201).json({ data: rows[0], message: 'Локация создана' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: `Локация с code="${code}" уже существует` });
    }
    console.error('POST /admin/pain-locations error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось создать локацию' });
  }
});

/**
 * PUT /api/admin/pain-locations/:code
 * Обновить локацию (label, position, is_red_flag, red_flag_reason, is_active).
 * program_type и code НЕ редактируются (immutable FK identity).
 */
router.put('/pain-locations/:code', authenticateToken, requireAdmin, async (req, res) => {
  const { code } = req.params;
  const { label, position, is_red_flag, red_flag_reason, is_active } = req.body;

  if (label !== undefined && (typeof label !== 'string' || label.length === 0 || label.length > 100)) {
    return res.status(400).json({ error: 'ValidationError', message: 'label длина 1..100' });
  }
  if (is_red_flag === true && (!red_flag_reason || red_flag_reason.length > 255)) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Для red-flag локации red_flag_reason обязателен (≤255 символов)'
    });
  }

  try {
    // buildPatch dynamic
    const sets = [];
    const params = [];
    let idx = 1;

    if (label !== undefined) { sets.push(`label = $${idx++}`); params.push(label); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position); }
    if (is_red_flag !== undefined) {
      sets.push(`is_red_flag = $${idx++}`);
      params.push(!!is_red_flag);
      // Если выключили red-flag — обнулить reason
      if (is_red_flag === false) {
        sets.push(`red_flag_reason = NULL`);
      }
    }
    if (red_flag_reason !== undefined && is_red_flag !== false) {
      sets.push(`red_flag_reason = $${idx++}`);
      params.push(red_flag_reason);
    }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!is_active); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'Нет полей для обновления' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(code);

    const { rows } = await query(
      `UPDATE pain_locations SET ${sets.join(', ')} WHERE code = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Локация не найдена' });
    }

    // Audit log
    await logAudit(req, 'update', 'pain_location', null, { code, changes: req.body });

    return res.json({ data: rows[0], message: 'Локация обновлена' });
  } catch (err) {
    console.error('PUT /admin/pain-locations/:code error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось обновить локацию' });
  }
});

/**
 * DELETE /api/admin/pain-locations/:code
 * Hard delete только если нет ссылок из pain_entry_locations.
 * Если есть ссылки — рекомендуем PUT с is_active=false (soft delete).
 */
router.delete('/pain-locations/:code', authenticateToken, requireAdmin, async (req, res) => {
  const { code } = req.params;

  try {
    // Проверить наличие ссылок
    const refsCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM pain_entry_locations WHERE location_code = $1`,
      [code]
    );
    const cnt = refsCheck.rows[0]?.cnt ?? 0;
    if (cnt > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Локация используется в ${cnt} записях боли. Деактивируйте (is_active=false) вместо удаления.`
      });
    }

    const { rowCount } = await query('DELETE FROM pain_locations WHERE code = $1', [code]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Локация не найдена' });
    }

    // Audit log
    await logAudit(req, 'delete', 'pain_location', null, { code });

    return res.json({ data: { code }, message: 'Локация удалена' });
  } catch (err) {
    console.error('DELETE /admin/pain-locations/:code error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось удалить локацию' });
  }
});
```

### D) Frontend `services/api.js` — добавить helpers

**Premise drift fix (readiness check 2026-05-16):** В `api.js` НЕ существует паттерна `xxxAdmin = { list, get, create, update, delete }`. Helpers для admin endpoints либо плоские (`listProgramTypes`, `createProgramType`), либо вызываются inline через `api.get('/admin/program-types')` прямо в компоненте.

**Action для Claude Code:** в verify-step (шаг 4) посмотри **как именно** `ProgramTypesTab` вызывает свои admin endpoints:

- **Вариант A** — есть плоские функции в api.js (`listProgramTypes`, `createProgramType`, и т.д.):
  ```javascript
  export const listPainLocations = (params = {}) => api.get('/admin/pain-locations', { params });
  export const getPainLocation = (code) => api.get(`/admin/pain-locations/${encodeURIComponent(code)}`);
  export const createPainLocation = (data) => api.post('/admin/pain-locations', data);
  export const updatePainLocation = (code, data) => api.put(`/admin/pain-locations/${encodeURIComponent(code)}`, data);
  export const deletePainLocation = (code) => api.delete(`/admin/pain-locations/${encodeURIComponent(code)}`);
  ```

- **Вариант B** — inline вызовы `api.get('/admin/...')` прямо в компоненте без helpers:
  В этом случае **не добавляем** ничего в `api.js`, вызовы пишем прямо в `PainLocationsTab` (`api.get('/admin/pain-locations', { params })` и т.д.).

**Копируем тот же паттерн, что используется для `ProgramTypesTab` — это критично для consistency.** Не изобретаем третий стиль.

**Замечание:** axios interceptor unwrap'ит `{ data: payload }` в `response.data = payload`. В компоненте получаем массив напрямую, и `response.meta.total` — общее количество.

### E) Frontend новая вкладка `PainLocationsTab` в `AdminContent.js`

**Premise drift fix (readiness check 2026-05-16):**
- AdminContent.js — **1242 строк** (5 inline tab-компонентов: PhasesTab/TipsTab/VideosTab/ProgramTypesTab/ProgramTemplatesTab), после добавления PainLocationsTab станет ~1440. Размер ОК (ProgramTemplatesTab уже 472 строки сам по себе).
- **CSS Modules alias — `s` (НЕ `styles`)**: `import s from './AdminContent.module.css'` уже наверху файла, использовать `className={s.painLocFilter}`, `className={s.redFlagBadge}` и т.д.
- **Tab key — kebab-case**: `'pain-locations'` (как `'program-types'`, `'program-templates'`).
- Переключение табов: state `tab`, рендер через `{tab === 'pain-locations' && <PainLocationsTab />}` (паттерн с строки ~1233 в AdminContent.js).

**Образец:** функция `ProgramTypesTab` (~252 строки) — копируем структуру 1:1 (state, useEffect, table layout, edit form, CRUD handlers).

**Состояние таба:**
```javascript
const [locations, setLocations] = useState([]);
const [programTypes, setProgramTypes] = useState([]);
const [loading, setLoading] = useState(true);
const [filter, setFilter] = useState({ program_type: '', is_active: '' });
const [editing, setEditing] = useState(null);  // объект для редактирования или null
const [creating, setCreating] = useState(false); // показывать форму создания
```

**Загрузка** (используем паттерн вызова admin endpoints из ProgramTypesTab — см. секцию D):
```javascript
useEffect(() => {
  if (tab !== 'pain-locations') return;
  loadLocations();
  loadProgramTypes();  // для dropdown filter и create form
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab, filter]);

const loadLocations = async () => {
  setLoading(true);
  try {
    const params = {};
    if (filter.program_type) params.program_type = filter.program_type;
    if (filter.is_active !== '') params.is_active = filter.is_active;
    // Если в ProgramTypesTab используется helper из api.js — используй listPainLocations(params)
    // Если inline — пиши api.get('/admin/pain-locations', { params })
    const data = await listPainLocations(params);  // ← подмени на актуальный вызов
    setLocations(data);
  } catch (err) {
    toast.error('Не удалось загрузить локации боли');
  } finally {
    setLoading(false);
  }
};
```

**UI layout** (примерно, точную разметку Claude Code согласовывает с существующими табами):

```
[Filter row]
  Программа: [dropdown — Все / ACL / Shoulder / ...]
  Статус:    [dropdown — Все / Только активные / Только архив]
  [+ Добавить локацию] кнопка

[Table]
  code | label | программа | позиция | red-flag | активна | действия
  ─────┼───────┼──────────┼─────────┼─────────┼────────┼─────────
  knee_anterior  | Передняя ... | ACL  | 10 | —  | ✓ | [edit] [del]
  calf_posterior | Икроножная.. | ACL  | 80 | ⚠  | ✓ | [edit] [del]
  ...

[Inline edit/create form — появляется под таблицей или модалкой]
  code         [text, disabled при edit]
  program_type [select из programTypes, disabled при edit]
  label        [text 100]
  position     [number]
  is_red_flag  [checkbox]
  red_flag_reason [textarea 255, виден только если is_red_flag=true]
  is_active    [checkbox]
  [Сохранить] [Отмена]
```

**Иконки:** только lucide-react (правило). Например `Plus`, `Edit2`, `Trash2`, `AlertTriangle` для red-flag индикатора.

**Toggle is_red_flag UX:** при unchecking — `red_flag_reason` подсвечивается серым, но не очищается до save. На save backend сам обнулит reason если is_red_flag=false (логика выше в PUT handler).

**Toast'ы:**
- `toast.success('Локация создана')` — на POST 201
- `toast.success('Локация обновлена')` — на PUT 200
- `toast.success('Локация удалена')` — на DELETE 200
- `toast.error('Локация используется в N записях. Деактивируйте вместо удаления.')` — на DELETE 409
- `toast.error(<err.response.data.message>)` — generic для других ошибок

**Регистрация вкладки в tabs array:** добавить новый объект `{ key: 'pain-locations', label: 'Локации боли', icon: MapPin }` после `program-templates` (как 6-й таб).

**CSS:** AdminContent.js уже на CSS Modules (alias `s`). Расширить `AdminContent.module.css` camelCase классами:
- `.painLocFilter` — row для filter dropdowns
- `.painLocTable` — table
- `.redFlagBadge` — badge для red-flag иконки в таблице
- `.painLocForm` — inline edit/create form
- `.redFlagFieldGroup` — group для is_red_flag checkbox + reason textarea (показывается conditionally)

В компоненте — `className={s.painLocFilter}`, `className={s.redFlagBadge}` и т.д. **Никаких глобальных string-классов.**

### F) Регистрация роута

В `backend/server.js` уже есть `app.use('/api/admin', adminRoutes)` — наши новые роуты автоматически попадают. **Ничего не трогаем в server.js.**

---

## Mock-based тесты

### Backend: `backend/tests/__tests__/admin.routes.test.js` (extend)

Добавить блок после существующих admin тестов:

```javascript
describe('Admin pain_locations CRUD (Wave 2 коммит 2.02)', () => {
  // Premise drift fix: backend использует logAudit helper из admin.js:17 (не inline INSERT).
  // logAudit внутри вызывает query('INSERT INTO audit_logs ...').
  // Тесты проверяют audit через db.query mock — ищем вызов с INSERT INTO audit_logs
  // в любой позиции (а не строго [2]), потому что logAudit может делать дополнительные
  // запросы (например, проверка пользователя).

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock authenticated admin user
    require('../../middleware/auth').authenticateToken = jest.fn((req, _res, next) => {
      req.user = { id: 1, role: 'admin', is_active: true };
      next();
    });
    require('../../middleware/auth').requireAdmin = jest.fn((req, _res, next) => next());
  });

  it('GET /admin/pain-locations возвращает список', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { code: 'knee_anterior', program_type: 'acl', label: 'Передняя…', is_red_flag: false, is_active: true },
        { code: 'calf_posterior', program_type: 'acl', label: 'Икроножная…', is_red_flag: true, is_active: true }
      ]
    });

    const res = await request(app).get('/api/admin/pain-locations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('GET /admin/pain-locations?program_type=acl фильтрует', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', program_type: 'acl' }] });
    const res = await request(app).get('/api/admin/pain-locations?program_type=acl');
    expect(res.status).toBe(200);
    // Проверить что в WHERE передан program_type
    expect(db.query.mock.calls[0][1]).toContain('acl');
  });

  it('GET /admin/pain-locations/:code возвращает одну запись', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', program_type: 'acl', label: 'Передняя' }] });
    const res = await request(app).get('/api/admin/pain-locations/knee_anterior');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('knee_anterior');
  });

  it('GET /admin/pain-locations/:code 404 если нет', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/admin/pain-locations/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /admin/pain-locations создаёт + audit_log', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'acl' }] })  // program_types check
      .mockResolvedValueOnce({ rows: [{ code: 'new_loc', program_type: 'acl', label: 'X', is_active: true }] })  // INSERT
      .mockResolvedValue({ rows: [] });  // catch-all для logAudit и других call'ов

    const res = await request(app)
      .post('/api/admin/pain-locations')
      .send({ code: 'new_loc', program_type: 'acl', label: 'X' });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('new_loc');
    // Audit log проверка — ищем INSERT INTO audit_logs в любом вызове query
    const auditCall = db.query.mock.calls.find(call => /INSERT INTO audit_logs/.test(call[0]));
    expect(auditCall).toBeDefined();
  });

  it('POST валидация — code невалидный', async () => {
    const res = await request(app)
      .post('/api/admin/pain-locations')
      .send({ code: 'Invalid-CODE!', program_type: 'acl', label: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('POST валидация — red-flag без reason', async () => {
    const res = await request(app)
      .post('/api/admin/pain-locations')
      .send({ code: 'new_loc', program_type: 'acl', label: 'X', is_red_flag: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/red_flag_reason обязателен/);
  });

  it('POST 409 при дубле code', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'acl' }] })
      .mockRejectedValueOnce({ code: '23505' });
    const res = await request(app)
      .post('/api/admin/pain-locations')
      .send({ code: 'knee_anterior', program_type: 'acl', label: 'X' });
    expect(res.status).toBe(409);
  });

  it('PUT обновляет label', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', label: 'Новый label' }] })
      .mockResolvedValueOnce({ rows: [] });  // audit
    const res = await request(app)
      .put('/api/admin/pain-locations/knee_anterior')
      .send({ label: 'Новый label' });
    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('Новый label');
  });

  it('PUT 404 если нет', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/admin/pain-locations/nonexistent').send({ label: 'X' });
    expect(res.status).toBe(404);
  });

  it('PUT отключение red-flag обнуляет reason', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'calf_posterior', is_red_flag: false, red_flag_reason: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/admin/pain-locations/calf_posterior')
      .send({ is_red_flag: false });
    expect(res.status).toBe(200);
    // Проверить что SET содержит red_flag_reason = NULL
    expect(db.query.mock.calls[0][0]).toMatch(/red_flag_reason = NULL/);
  });

  it('DELETE 409 если есть ссылки', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ cnt: 5 }] });
    const res = await request(app).delete('/api/admin/pain-locations/knee_anterior');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/в 5 записях/);
  });

  it('DELETE успешно при отсутствии ссылок + audit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })  // refs check
      .mockResolvedValueOnce({ rowCount: 1 })          // DELETE
      .mockResolvedValue({ rows: [] });                // catch-all для logAudit
    const res = await request(app).delete('/api/admin/pain-locations/knee_anterior');
    expect(res.status).toBe(200);
    const auditCall = db.query.mock.calls.find(call => /INSERT INTO audit_logs/.test(call[0]));
    expect(auditCall).toBeDefined();
  });

  it('DELETE 404 если нет такой локации', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).delete('/api/admin/pain-locations/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

**Также добавить sanity test для seed migration:**

В `backend/tests/__tests__/wave2_schema.test.js` (создан в 2.01) — добавить блок:

```javascript
describe('Wave 2 pain_locations seed (коммит 2.02)', () => {
  const seedPath = path.join(__dirname, '../../database/migrations/20260517_pain_locations_seed.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(seedPath, 'utf8');
  });

  it('16 INSERT строк (8 knee + 8 shoulder)', () => {
    // Считаем VALUES rows — самый надёжный способ
    const valuesMatches = sql.match(/\(\s*'[a-z_]+'\s*,/g) || [];
    expect(valuesMatches.length).toBe(16);
  });

  it('содержит 2 red-flag локации', () => {
    expect(sql).toMatch(/'calf_posterior'[\s\S]+?TRUE/);
    expect(sql).toMatch(/'neck_lateral'[\s\S]+?TRUE/);
  });

  it('идемпотентность ON CONFLICT DO NOTHING', () => {
    const onConflictMatches = sql.match(/ON CONFLICT \(code\) DO NOTHING/g) || [];
    expect(onConflictMatches.length).toBeGreaterThanOrEqual(2);  // оба INSERT блока
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });

  it('red-flag locations имеют red_flag_reason', () => {
    // calf_posterior должен иметь reason text
    expect(sql).toMatch(/'calf_posterior'[\s\S]+?'Возможный тромбоз/);
    expect(sql).toMatch(/'neck_lateral'[\s\S]+?'Возможная цервикальная радикулопатия/);
  });
});
```

### Frontend: `frontend/src/pages/Admin/AdminPanel.test.js` (extend)

Добавить блок:

```javascript
describe('PainLocationsTab (Wave 2 коммит 2.02)', () => {
  // Premise drift fix: api.js не имеет xxxAdmin namespace.
  // Mock'аем те функции которые реально импортируются из api.js (см. verify-step шаг 4)
  beforeEach(() => {
    jest.clearAllMocks();
    // Пример если используются плоские helpers:
    require('../../services/api').listPainLocations = jest.fn().mockResolvedValue([
      { code: 'knee_anterior', program_type: 'acl', label: 'Передняя', is_red_flag: false, is_active: true },
      { code: 'calf_posterior', program_type: 'acl', label: 'Икроножная', is_red_flag: true, red_flag_reason: 'ТГВ', is_active: true }
    ]);
    require('../../services/api').createPainLocation = jest.fn().mockResolvedValue({ code: 'new_loc' });
    require('../../services/api').updatePainLocation = jest.fn().mockResolvedValue({ code: 'knee_anterior' });
    require('../../services/api').deletePainLocation = jest.fn().mockResolvedValue({ code: 'knee_anterior' });
    // listProgramTypes для filter dropdown — должен уже существовать после Wave 1
    require('../../services/api').listProgramTypes = jest.fn().mockResolvedValue([
      { code: 'acl', label: 'ПКС реабилитация' },
      { code: 'shoulder_general', label: 'Реабилитация плеча' }
    ]);
  });

  it('рендерит таб с локациями после загрузки', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => {
      expect(screen.getByText('Передняя')).toBeInTheDocument();
      expect(screen.getByText('Икроножная')).toBeInTheDocument();
    });
  });

  it('показывает иконку red-flag для calf_posterior', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => {
      const row = screen.getByText('Икроножная').closest('tr');
      expect(row.querySelector('[data-testid="red-flag-icon"]')).toBeInTheDocument();
    });
  });

  it('фильтр по program_type вызывает API с правильным параметром', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    fireEvent.change(screen.getByLabelText('Программа'), { target: { value: 'acl' } });
    await waitFor(() => {
      expect(listPainLocations).toHaveBeenCalledWith({ program_type: 'acl' });
    });
  });

  it('кнопка "Добавить" открывает форму создания', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    expect(screen.getByLabelText('code')).toBeInTheDocument();
  });

  it('создание новой локации вызывает createPainLocation', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    fireEvent.change(screen.getByLabelText('code'), { target: { value: 'test_loc' } });
    fireEvent.change(screen.getByLabelText('program_type'), { target: { value: 'acl' } });
    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/i }));
    await waitFor(() => {
      expect(createPainLocation).toHaveBeenCalledWith(expect.objectContaining({
        code: 'test_loc',
        program_type: 'acl',
        label: 'Тест'
      }));
    });
  });

  it('toggle is_red_flag показывает поле red_flag_reason', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    expect(screen.queryByLabelText('red_flag_reason')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('is_red_flag'));
    expect(screen.getByLabelText('red_flag_reason')).toBeInTheDocument();
  });

  it('delete с 409 (есть ссылки) показывает специальный toast', async () => {
    deletePainLocation.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Локация используется в 5 записях…' } }
    });
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    const deleteBtn = screen.getAllByRole('button', { name: /Удалить/i })[0];
    fireEvent.click(deleteBtn);
    fireEvent.click(screen.getByRole('button', { name: /Подтвердить|OK|Да/i }));
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringMatching(/используется в 5/) })
      );
    });
  });

  it('edit form НЕ позволяет менять code и program_type', async () => {
    render(<AdminContent tab="pain-locations" />);
    await waitFor(() => screen.getByText('Передняя'));
    const editBtn = screen.getAllByRole('button', { name: /Редактировать|Edit/i })[0];
    fireEvent.click(editBtn);
    expect(screen.getByLabelText('code')).toBeDisabled();
    expect(screen.getByLabelText('program_type')).toBeDisabled();
  });
});
```

---

## NOT TOUCH

- Существующие admin endpoints/табы (Phases, Tips, Videos, ProgramTypes, ProgramTemplates)
- Существующие миграции
- `pain_entries` / `pain_entry_locations` (2.04)
- `routes/rehab.js` — public pain locations endpoint в 2.04
- PatientDashboard frontend (`pd-*` стили, ExerciseRunner, любые компоненты)
- OAuth flow
- 4 dirty dark-theme файлов (2026-05-04)
- `backend/server.js` — admin роуты уже подключены через `app.use('/api/admin', adminRoutes)`
- `validators.js` — dead code, не подключаем здесь

---

## Smoke test

### Сценарий 1 — миграция применилась

```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260517_pain_locations_seed.sql
psql -U postgres -d azarean_rehab -c "SELECT code, program_type, is_red_flag FROM pain_locations ORDER BY program_type, position;"
```

**Ожидание:** 16 строк, 8 knee + 8 shoulder, два red-flag — `calf_posterior` и `neck_lateral`.

### Сценарий 2 — идемпотентность

```bash
# Запустить миграцию повторно
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260517_pain_locations_seed.sql

# Изменить запись через psql
psql -U postgres -d azarean_rehab -c "UPDATE pain_locations SET label='Изменено' WHERE code='knee_anterior';"

# Запустить миграцию ещё раз
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260517_pain_locations_seed.sql

# Проверить что изменение НЕ перетёрто
psql -U postgres -d azarean_rehab -c "SELECT label FROM pain_locations WHERE code='knee_anterior';"
```

**Ожидание:** `label = 'Изменено'` (ON CONFLICT DO NOTHING сохранил ручное правки).

### Сценарий 3 — Admin endpoints через curl

```bash
# Получить admin JWT
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vadim@azarean.com","password":"Test1234"}' | jq -r '.data.token')

# GET список
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/pain-locations | jq '.data | length'
# Ожидание: 16

# GET фильтр по program_type
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/pain-locations?program_type=acl" | jq '.data | length'
# Ожидание: 8

# POST новая локация
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"code":"test_loc","program_type":"acl","label":"Тест","position":99}' \
  http://localhost:5000/api/admin/pain-locations | jq
# Ожидание: 201, data с code='test_loc'

# PUT обновить
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"label":"Тест обновлён"}' \
  http://localhost:5000/api/admin/pain-locations/test_loc | jq
# Ожидание: 200, label='Тест обновлён'

# DELETE
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/pain-locations/test_loc | jq
# Ожидание: 200, удалено

# Audit log проверка
psql -U postgres -d azarean_rehab -c \
  "SELECT action, entity_type, details FROM audit_logs WHERE entity_type='pain_location' ORDER BY created_at DESC LIMIT 5;"
# Ожидание: видны create/update/delete записи
```

### Сценарий 4 — UI smoke в реальном браузере

1. Логин админом (vadim@azarean.com / Test1234) на http://localhost:3000/login
2. Перейти в Админ → Контент → таб «Локации боли»
3. Видны 16 локаций, отсортированы по program_type + position
4. Применить filter program_type=ACL → остались 8 knee
5. У `calf_posterior` виден red-flag индикатор (иконка `AlertTriangle`)
6. Открыть edit `knee_anterior` → изменить label → save → toast «Локация обновлена» → данные обновились
7. Создать тестовую локацию `test_loc_ui` → check is_red_flag → появилось поле reason → заполнить → save → 201
8. Удалить `test_loc_ui` → confirm → toast «Локация удалена» → исчезла
9. Попытка удалить `knee_anterior` (или другую, если уже использовалась) → 409 + специальный toast

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260517_pain_locations_seed.sql`

### Изменить
- `backend/database/seeds/pain_locations.sql` (replace placeholder content)
- `backend/routes/admin.js` (add ~120 строк pain_locations endpoints)
- `backend/tests/__tests__/admin.routes.test.js` (add ~14 тестов)
- `backend/tests/__tests__/wave2_schema.test.js` (add seed sanity describe)
- `frontend/src/services/api.js` (add painLocationsAdmin helpers)
- `frontend/src/pages/Admin/AdminContent.js` (add 6-я вкладка PainLocationsTab inline)
- `frontend/src/pages/Admin/AdminPanel.test.js` (add ~8 тестов)
- `CLAUDE.md`:
  - Секция «Запуск проекта → PostgreSQL» — добавить миграцию `20260517_pain_locations_seed`
  - Секция «API endpoints → Admin» — добавить 5 строк pain-locations endpoints
  - Секция «Завершённые исправления» — запись «Wave 2 коммит 2.02: pain_locations seed + admin CRUD»

### НЕ ТРОГАТЬ
- `backend/database/schema.sql`
- `backend/server.js`
- Любые существующие admin endpoints/табы
- `pain_entries` / `pain_entry_locations` (2.04)
- LOCKED-зоны

---

## Текст коммита

```
feat(admin): Wave 2 — pain_locations seed + AdminContent PainLocationsTab

Wave 2 коммит 2.02 — справочник локаций боли с admin CRUD UI.

Backend:
- Migration 20260517_pain_locations_seed.sql — 16 idempotent INSERTs
  (8 knee program_type='acl', 8 shoulder program_type='shoulder_general').
  Two red-flag locations: calf_posterior (ТГВ), neck_lateral (радикулопатия).
  ON CONFLICT DO NOTHING — сохраняет ручные правки при повторе.
- routes/admin.js — 5 endpoints: GET (list+filter), GET (one),
  POST, PUT, DELETE. Все с audit_logs. DELETE → 409 при ссылках из
  pain_entry_locations. PUT отключения red-flag обнуляет reason.

Frontend:
- services/api.js — painLocationsAdmin helpers (list, get, create,
  update, delete).
- AdminContent.js — 6-я inline вкладка PainLocationsTab по образцу
  ProgramTypesTab. Filter program_type + is_active, table layout,
  inline edit/create form, lucide-react AlertTriangle для red-flag,
  toast feedback.

Без patient-facing endpoints (это 2.04) и без UI пациента (2.05).
Это контент-фундамент для всей pain-tracking ветки Wave 2.

Tests:
- backend +14 (admin routes) + 5 (seed sanity)
- frontend +8 (PainLocationsTab)

Замечание: русские формулировки label — клинические placeholder'ы.
Vadim ревьюит и редактирует через UI после деплоя.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «Запуск проекта → 1. PostgreSQL» — добавить строку про новую миграцию `20260517_pain_locations_seed.sql`
- Секция «API endpoints → Admin» — добавить:
  ```
  | GET    | /api/admin/pain-locations         | JWT + Admin | Список локаций (filter program_type, is_active) |
  | GET    | /api/admin/pain-locations/:code   | JWT + Admin | Одна локация |
  | POST   | /api/admin/pain-locations         | JWT + Admin | Создать |
  | PUT    | /api/admin/pain-locations/:code   | JWT + Admin | Обновить |
  | DELETE | /api/admin/pain-locations/:code   | JWT + Admin | Удалить (409 если есть ссылки) |
  ```
- Секция «Завершённые исправления» — запись:
  > **Wave 2 коммит 2.02** — pain_locations seed (16 записей) + AdminContent PainLocationsTab inline CRUD. Two red-flag locations подсвечены. Audit logging для CUD. DELETE защищён от refs из pain_entry_locations.

**Memory:**
- `wave_2_progress.md` — статус 2.02 → `⏸ заморожен` после прохождения тестов
- Если verify-step показал, что коды program_types отличаются от `acl`/`shoulder_general` — записать `memory/architect_premise_drift_2026-05-XX.md` с фактическими кодами и тем, как seed был адаптирован

---

## Definition of Done

- [ ] Verify-step выполнен полностью, фактические `program_types.code` подтверждены или сообщены архитектору
- [ ] Миграция `20260517_pain_locations_seed.sql` создана, idempotency проверена (ручной UPDATE сохраняется при re-run)
- [ ] Все 16 записей видны в `SELECT * FROM pain_locations ORDER BY program_type, position`
- [ ] 5 admin endpoints работают через curl (GET list + filter, GET one, POST, PUT, DELETE)
- [ ] DELETE возвращает 409 при наличии ссылок из `pain_entry_locations` (можно симулировать ручным INSERT в pain_entry_locations)
- [ ] PUT отключения `is_red_flag=false` обнуляет `red_flag_reason` в БД
- [ ] Audit log записывает все CUD операции (entity_type='pain_location')
- [ ] PainLocationsTab рендерится 6-й вкладкой в AdminContent
- [ ] Filter program_type работает, table показывает данные с red-flag иконкой
- [ ] Создание/редактирование/удаление через UI с toast feedback
- [ ] Edit form блокирует `code` и `program_type` (immutable)
- [ ] Все ~14 backend admin тестов + 5 seed sanity + ~8 frontend тестов зелёные
- [ ] Существующие тесты не сломаны (backend ≥ 444 после 2.01+2.02, frontend ≥ 263)
- [ ] CLAUDE.md обновлён (migration list + admin endpoints table + completed fixes)
- [ ] Коммит создан с указанным текстом + Co-Authored-By trailer
- [ ] `wave_2_progress.md` — статус 2.02 → `⏸ заморожен`
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт от ветки `wave-2/02-pain-locations`, остаётся висеть до batch merge в конце Wave 2
