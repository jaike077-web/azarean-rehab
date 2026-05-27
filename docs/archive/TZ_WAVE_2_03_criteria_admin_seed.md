# TZ Wave 2 · Коммит 2.03 — ACL criteria seed + AdminContent PhasesTab criteria sub-CRUD

**Дата:** 2026-05-16
**Версия:** v1 (учитывает все премис-дрейф фиксы из Readiness Check 2026-05-16)
**Roadmap:** PATIENT_UX_ROADMAP_2026-05-08_v2.md Волна 2 + clinical foundation 2026-05-13—16
**Цель:** Заполнить `phase_transition_criteria` ~30 default ACL-критериями (распределены по 6 фазам ПКС), расширить PhasesTab в AdminContent.js sub-CRUD для критериев под каждой фазой. После этого коммита Vadim ревьюит/калибрует criteria через UI, и 2.11 evaluator имеет данные для auto-check.
**Объём:** 6-7 часов
**Риск:** средний — большой seed с медицинским содержанием (clinical review нужен) + UI сложнее чем 2.02 (3 типа критериев → conditional fields).

**Применённые премис-дрейф фиксы из Readiness Check 2026-05-16:**
- ✅ CSS Modules alias `s` (не `styles`)
- ✅ Audit logging — через **существующий** helper `logAudit(req, action, entityType, entityId, details)` из `admin.js:17`
- ✅ api.js — verify-driven: копируем паттерн вызова admin endpoints от существующей PhasesTab
- ✅ Tab keys kebab-case (PhasesTab — `'phases'`)
- ✅ program_types коды зафиксированы (`acl` для knee ACL фаз)

---

## Verify-step перед стартом

**Обязательно сделай grep до начала кода:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) 2.01 применён — phase_transition_criteria существует, ALTER patients прошёл
psql -U postgres -d azarean_rehab -c "\d phase_transition_criteria"
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM phase_transition_criteria;"
# Ожидание: таблица есть, COUNT = 0. Если таблицы нет — СТОП, сначала 2.01.

# 2) 2.02 применён (необязательно но полезно — PainLocationsTab паттерн)
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM pain_locations;"
# Ожидание: 16 (после 2.02). Если 0 — Wave 2 структурно ОК, можно работать,
# но образец PainLocationsTab будет в коде 2.02 PR (а не main). Не блокер.

# 3) КРИТИЧНО: 6 ACL фаз существуют в rehab_phases с program_type='acl'
psql -U postgres -d azarean_rehab -c \
  "SELECT id, phase_number, title FROM rehab_phases WHERE program_type='acl' ORDER BY phase_number;"
# Ожидание: 6 строк с phase_number 1..6.
# Если меньше / другие phase_number / другой program_type — СТОП, скажи архитектору.
# Seed построен на JOIN по (program_type='acl', phase_number) — без 6 фаз он не сработает.

# 4) Структура rehab_phases — Wave 1 мог добавить колонки
psql -U postgres -d azarean_rehab -c "\d rehab_phases"
# Ожидание: видны program_type, phase_number, title, subtitle, duration_weeks, ...
# Если есть неожиданные NOT NULL колонки которые могут конфликтовать с criteria sub-table — сообщить

# 5) PhasesTab — структура и точное имя компонента
grep -n "function PhasesTab\|const PhasesTab" frontend/src/pages/Admin/AdminContent.js
grep -n "tab === 'phases'" frontend/src/pages/Admin/AdminContent.js
wc -l frontend/src/pages/Admin/AdminContent.js  # Readiness check: было 1242, после 2.02 ~1440
# Ожидание: PhasesTab — inline функция-компонент в AdminContent.js, ~207 строк

# 6) CSS Modules alias (зафиксировано: `s`, не `styles`)
grep -n "^import s from\|^import styles from" frontend/src/pages/Admin/AdminContent.js | head -3
# Ожидание: import s from './AdminContent.module.css'

# 7) logAudit helper
grep -n "function logAudit\|async function logAudit" backend/routes/admin.js
# Ожидание: function logAudit(req, action, entityType, entityId, details) на ~admin.js:17

# 8) Как PhasesTab вызывает admin endpoints — паттерн для копирования
grep -n "api\.\(get\|post\|put\|delete\)(.*phases" frontend/src/pages/Admin/AdminContent.js | head -10
grep -n "listPhases\|createPhase\|updatePhase\|deletePhase" frontend/src/services/api.js | head -5
# Ожидание: найдём паттерн — плоские функции в api.js ИЛИ inline api.get('/admin/phases')
# КОПИРУЕМ ТОТ ЖЕ паттерн для criteria endpoints

# 9) Существующие admin endpoints для phases — посмотреть как структурированы
grep -n "router\.\(get\|post\|put\|delete\)(.*phases\|/phases" backend/routes/admin.js | head -10
# Ожидание: видны GET /phases, POST /phases, PUT /phases/:id, DELETE /phases/:id
# (Замечание: эти endpoints скорее всего НЕ используют logAudit — Wave 1 gap, hot-fix #6 backlog)

# 10) Подтвердить что criteria endpoints ещё не существуют (артефакты)
grep -rn "phase_transition_criteria\|/phases.*criteria\|criterion" backend/routes/ frontend/src/ 2>/dev/null
# Ожидание: 0 совпадений
```

**Зачем (что фиксируем):**
- 6 ACL фаз — критично для seed (JOIN by phase_number)
- PhasesTab структура — наш образец для расширения
- Паттерн вызова admin endpoints — копируем 1:1
- logAudit helper — используем существующий

**Если grep покажет что:**
- 6 ACL фаз с phase_number 1..6 ≠ найдено → СТОП, я перепишу seed под фактические phase_number'а
- PhasesTab переименован / структура не считается → СТОП, попроси архитектора посмотреть
- Какие-то существующие endpoints для criteria → СТОП (артефакт)

---

## Зависимости

После 2.01 (schema с `phase_transition_criteria`) и 2.02 (PainLocationsTab прецедент для inline admin CRUD).

**Ветка:** `wave-2/03-criteria-admin-seed` от `wave-2/02-pain-locations` (rebase chain для batch merge).

---

## Что блокирует

- **2.11** (Backend phase-criteria endpoints + auto-check evaluator) — ему нужны критерии в БД для testing evaluation logic. Без seed evaluator может работать, но pointless без данных.
- **2.13** (Frontend Roadmap UI с criteria checkboxes) — ему нужны данные для рендера.
- **2.12** (self_report + instructor_check flows) — то же самое, нужны критерии.

Без 2.03 — Block E (criteria evaluation) разработать можно, но без content layer'а — fake-смотрится.

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `backend/database/migrations/20260518_acl_criteria_seed.sql` | НОВЫЙ — ~30 idempotent INSERTs (1 WITH clause, ON CONFLICT) |
| `backend/database/seeds/acl_criteria.sql` | НОВЫЙ — зеркальная копия миграции (dev / clinical review) |
| `backend/routes/admin.js` | EXTEND — добавить ~150 строк: 4 endpoints для criteria + audit |
| `backend/tests/__tests__/admin.routes.test.js` | EXTEND — `describe('Phase criteria CRUD')` блок (~12 тестов) |
| `backend/tests/__tests__/wave2_schema.test.js` | EXTEND — sanity тесты для seed (~6 проверок) |
| `frontend/src/services/api.js` | EXTEND — helpers для criteria endpoints (паттерн из verify-step) |
| `frontend/src/pages/Admin/AdminContent.js` | EXTEND — PhasesTab расширить sub-CRUD для criteria (~250-300 строк) |
| `frontend/src/pages/Admin/AdminContent.module.css` | EXTEND — camelCase классы для criteria UI |
| `frontend/src/pages/Admin/AdminPanel.test.js` | EXTEND — тесты для PhasesTab criteria UI (~8-10 тестов) |
| `CLAUDE.md` | UPDATE — migrations list + admin endpoints table + completed fixes |

**НЕ ТРОГАТЬ:**

- Существующие phases endpoints / поведение PhasesTab (только расширение, не модификация existing)
- PainLocationsTab (это 2.02, уже в feature-ветке)
- Patient frontend / endpoints
- `phase_transition_criteria` schema (только seed, не ALTER)
- LOCKED-зоны
- `pain_*` таблицы (это 2.04+)
- `patient_criterion_answers` (CRUD endpoints — это 2.12)

---

## Конкретная реализация

### A) Seed migration: `backend/database/migrations/20260518_acl_criteria_seed.sql`

**Паттерн:** WITH clause с `VALUES` + INSERT...SELECT с JOIN на rehab_phases. Идемпотентность через `ON CONFLICT (phase_id, criterion_code) DO NOTHING` (UNIQUE constraint из 2.01).

**Структура: ~30 критериев, 4-6 на фазу, разделены по 3 типам.**

```sql
-- Wave 2 коммит 2.03 — ACL default phase transition criteria seed
-- ~30 критериев распределены по 6 фазам ПКС (Protection → Maintenance).
-- Источник: AAOS/APTA guidelines (Claude'а initial draft). Vadim ревьюит и калибрует через UI.
-- Идемпотентно: ON CONFLICT (phase_id, criterion_code) DO NOTHING — повторный запуск безопасен.

BEGIN;

WITH criteria_data (
  phase_number, criterion_code, label, criterion_type,
  measurement_type, measurement_source,
  threshold_operator, threshold_value, threshold_value2,
  staleness_days,
  self_report_question, self_report_hint,
  position, is_required
) AS (VALUES
  -- ============================================================
  -- Phase 1: Защита (0-2 недели)
  -- Цель: контроль воспаления, восстановление полного разгибания
  -- ============================================================
  (1, 'full_extension',     'Полное активное разгибание колена (0°)',          'measurement', 'knee_extension_degrees', 'rom',  '=',  0::numeric,  NULL::numeric, 7::smallint, NULL, NULL, 10::smallint, TRUE),
  (1, 'pain_at_rest_low',   'Боль в покое ≤ 3 по ВАШ',                          'measurement', 'vas_score',              'pain', '<=', 3::numeric,  NULL::numeric, 7::smallint, NULL, NULL, 20::smallint, TRUE),
  (1, 'no_extension_lag',   'Отсутствует extension lag (квадрицепс работает)',  'instructor_check', NULL,                NULL,   NULL, NULL,        NULL,          7::smallint, NULL, NULL, 30::smallint, TRUE),
  (1, 'effusion_controlled','Отёк сустава контролируется',                       'instructor_check', NULL,                NULL,   NULL, NULL,        NULL,          7::smallint, NULL, NULL, 40::smallint, TRUE),
  (1, 'pwb_ambulation',     'Могу передвигаться на костылях с частичной опорой','self_report',      NULL,                NULL,   NULL, NULL,        NULL,          7::smallint,
                                                                                                                                                                  'Можете передвигаться на костылях с частичной нагрузкой на ногу?',
                                                                                                                                                                  'Попробуйте сделать несколько шагов по комнате', 50::smallint, TRUE),

  -- ============================================================
  -- Phase 2: Ранняя мобильность (2-6 недель)
  -- Цель: восстановление сгибания, отказ от костылей
  -- ============================================================
  (2, 'flexion_90',         'Сгибание ≥ 90°',                                   'measurement', 'knee_flexion_degrees',   'rom',  '>=', 90::numeric, NULL::numeric, 7::smallint, NULL, NULL, 10::smallint, TRUE),
  (2, 'extension_maintained','Полное разгибание сохраняется',                   'measurement', 'knee_extension_degrees', 'rom',  '=',  0::numeric,  NULL::numeric, 7::smallint, NULL, NULL, 20::smallint, TRUE),
  (2, 'pain_activity_low',  'Боль при активности ≤ 2 по ВАШ',                   'measurement', 'vas_score',              'pain', '<=', 2::numeric,  NULL::numeric, 7::smallint, NULL, NULL, 30::smallint, TRUE),
  (2, 'walk_no_limp',       'Хожу без хромоты',                                 'self_report', NULL,                     NULL,   NULL, NULL,        NULL,          7::smallint,
                                                                                                                                                                  'Можете пройти 100 метров без хромоты?',
                                                                                                                                                                  'Пройдите по комнате — обращайте внимание не подволакиваете ли ногу', 40::smallint, TRUE),
  (2, 'effusion_minimal',   'Минимальный отёк сустава',                          'instructor_check', NULL,                NULL,   NULL, NULL,        NULL,          7::smallint, NULL, NULL, 50::smallint, TRUE),

  -- ============================================================
  -- Phase 3: Укрепление (6-12 недель)
  -- Цель: ROM ≥ 120°, развитие мышечной силы, отсутствие отёка
  -- ============================================================
  (3, 'flexion_120',        'Сгибание ≥ 120°',                                  'measurement', 'knee_flexion_degrees',   'rom',  '>=', 120::numeric, NULL::numeric, 7::smallint, NULL, NULL, 10::smallint, TRUE),
  (3, 'single_leg_balance', 'Одноногая стойка ≥ 30 сек на оперированной ноге',  'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          7::smallint, NULL, NULL, 20::smallint, TRUE),
  (3, 'stairs_normal',      'Поднимаюсь по лестнице без чрезмерной опоры на здоровую ногу', 'self_report', NULL,         NULL,   NULL, NULL,         NULL,          7::smallint,
                                                                                                                                                                   'Можете подняться на 1 этаж нормальным шагом?',
                                                                                                                                                                   'Попробуйте подняться без перил', 30::smallint, TRUE),
  (3, 'no_effusion',        'Отёк отсутствует',                                 'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          7::smallint, NULL, NULL, 40::smallint, TRUE),
  (3, 'pain_min_activity',  'Боль при бытовой активности ≤ 1 по ВАШ',           'measurement', 'vas_score',              'pain', '<=', 1::numeric,   NULL::numeric, 7::smallint, NULL, NULL, 50::smallint, TRUE),

  -- ============================================================
  -- Phase 4: Функциональная (3-6 месяцев)
  -- Цель: полный ROM, симметрия, начало динамических движений
  -- ============================================================
  (4, 'flexion_135',        'Сгибание ≥ 135° (полный ROM)',                     'measurement', 'knee_flexion_degrees',   'rom',  '>=', 135::numeric, NULL::numeric, 7::smallint, NULL, NULL, 10::smallint, TRUE),
  (4, 'single_leg_squat',   'Одноногое приседание до 60° без боли',             'self_report', NULL,                     NULL,   NULL, NULL,         NULL,          7::smallint,
                                                                                                                                                                   'Можете присесть на оперированной ноге до 60° без боли?',
                                                                                                                                                                   'Опирайтесь рукой о стену для безопасности', 20::smallint, TRUE),
  (4, 'bilateral_squat_sym','Двуногое приседание без видимой асимметрии',       'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          7::smallint, NULL, NULL, 30::smallint, TRUE),
  (4, 'pain_zero_rest',     'Боль в покое отсутствует (0 по ВАШ)',              'measurement', 'vas_score',              'pain', '=',  0::numeric,   NULL::numeric, 7::smallint, NULL, NULL, 40::smallint, TRUE),
  (4, 'jump_landing_ok',    'Прыжки и приземление с правильной механикой',      'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          7::smallint, NULL, NULL, 50::smallint, TRUE),

  -- ============================================================
  -- Phase 5: Продвинутая (4-6 месяцев)
  -- Цель: LSI ≥ 90%, спортивно-специфические движения, return-to-sport assessment
  -- ============================================================
  (5, 'single_hop_lsi',     'Single-leg hop test LSI ≥ 90%',                    'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          14::smallint, NULL, NULL, 10::smallint, TRUE),
  (5, 'triple_hop_lsi',     'Triple-hop test LSI ≥ 90%',                        'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          14::smallint, NULL, NULL, 20::smallint, TRUE),
  (5, 'sport_pain_free',    'Спортивно-специфические движения без боли',        'self_report', NULL,                     NULL,   NULL, NULL,         NULL,          7::smallint,
                                                                                                                                                                   'Выполняете специфические для своего спорта движения без боли?',
                                                                                                                                                                   'Резкие повороты, остановки, ускорения', 30::smallint, TRUE),
  (5, 'no_swelling_after',  'Отсутствие отёка после высокоинтенсивной нагрузки','instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          7::smallint, NULL, NULL, 40::smallint, TRUE),
  (5, 'psych_readiness',    'Психологическая готовность к возврату в спорт',    'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          14::smallint, NULL, NULL, 50::smallint, TRUE),

  -- ============================================================
  -- Phase 6: Поддержка (6+ месяцев)
  -- Цель: поддержание полного ROM, отсутствие симптомов, compliance
  -- ============================================================
  (6, 'rom_maintained',     'Полный ROM сохраняется (≥ 135°)',                  'measurement', 'knee_flexion_degrees',   'rom',  '>=', 135::numeric, NULL::numeric, 14::smallint, NULL, NULL, 10::smallint, TRUE),
  (6, 'pain_absent',        'Боль отсутствует',                                 'measurement', 'vas_score',              'pain', '=',  0::numeric,   NULL::numeric, 14::smallint, NULL, NULL, 20::smallint, TRUE),
  (6, 'home_compliance',    'Регулярно выполняю упражнения дома',               'self_report', NULL,                     NULL,   NULL, NULL,         NULL,          14::smallint,
                                                                                                                                                                   'Выполняете поддерживающие упражнения хотя бы 3 раза в неделю?',
                                                                                                                                                                   'Без compliance высок риск re-injury', 30::smallint, TRUE),
  (6, 'no_reinjury_signs',  'Отсутствие признаков повторной травмы',            'instructor_check', NULL,                NULL,   NULL, NULL,         NULL,          14::smallint, NULL, NULL, 40::smallint, TRUE)
)
INSERT INTO phase_transition_criteria (
  phase_id, criterion_code, label, criterion_type,
  measurement_type, measurement_source,
  threshold_operator, threshold_value, threshold_value2, staleness_days,
  self_report_question, self_report_hint,
  position, is_required, is_active
)
SELECT
  p.id, cd.criterion_code, cd.label, cd.criterion_type,
  cd.measurement_type, cd.measurement_source,
  cd.threshold_operator, cd.threshold_value, cd.threshold_value2, cd.staleness_days,
  cd.self_report_question, cd.self_report_hint,
  cd.position, cd.is_required, TRUE
FROM criteria_data cd
JOIN rehab_phases p ON p.program_type = 'acl' AND p.phase_number = cd.phase_number
ON CONFLICT (phase_id, criterion_code) DO NOTHING;

COMMIT;
```

**Замечание Vadim'у:** seed — **draft**, clinical review обязателен. Особо проверь:
- Phase 5 LSI hop tests — может быть нужно `measurement` через какой-то отдельный measurement_type (`hop_test_lsi_percent`?), сейчас instructor_check
- Phase 1 PWB — точная формулировка может быть в твоей клинической традиции другой
- Threshold values — это standard AAOS/APTA, но твой опыт первичен. Редактируй через UI после деплоя.

### B) Зеркальный seed: `backend/database/seeds/acl_criteria.sql`

Полная копия миграции выше для dev-удобства / clinical review. Авторитетная — migration.

### C) Backend endpoints в `routes/admin.js`

**4 endpoints, все с logAudit (helper из admin.js:17).**

```javascript
// === Phase Transition Criteria (Wave 2 коммит 2.03) ===

/**
 * GET /api/admin/phases/:phase_id/criteria
 * Список критериев фазы (опц. filter is_active).
 */
router.get('/phases/:phase_id/criteria', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const phase_id = parseInt(req.params.phase_id, 10);
    if (isNaN(phase_id)) {
      return res.status(400).json({ error: 'ValidationError', message: 'phase_id должен быть числом' });
    }

    const { is_active } = req.query;
    let sql = `
      SELECT id, phase_id, criterion_code, label, criterion_type,
             measurement_type, measurement_source,
             threshold_operator, threshold_value, threshold_value2, staleness_days,
             self_report_question, self_report_hint,
             position, is_required, is_active, created_at, updated_at
      FROM phase_transition_criteria
      WHERE phase_id = $1
    `;
    const params = [phase_id];

    if (is_active !== undefined) {
      params.push(is_active === 'true' || is_active === true);
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ` ORDER BY position, id`;
    const { rows } = await query(sql, params);
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /admin/phases/:phase_id/criteria error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить критерии' });
  }
});

/**
 * POST /api/admin/phases/:phase_id/criteria
 * Создать критерий под фазой.
 * Body: { criterion_code, label, criterion_type, ... (conditional fields) }
 */
router.post('/phases/:phase_id/criteria', authenticateToken, requireAdmin, async (req, res) => {
  const phase_id = parseInt(req.params.phase_id, 10);
  if (isNaN(phase_id)) {
    return res.status(400).json({ error: 'ValidationError', message: 'phase_id должен быть числом' });
  }

  const {
    criterion_code, label, criterion_type,
    measurement_type, measurement_source,
    threshold_operator, threshold_value, threshold_value2, staleness_days,
    self_report_question, self_report_hint,
    position, is_required
  } = req.body;

  // Базовая валидация
  if (!criterion_code || !/^[a-z0-9_]+$/.test(criterion_code) || criterion_code.length > 50) {
    return res.status(400).json({ error: 'ValidationError', message: 'criterion_code: lowercase + digits + underscore, до 50 символов' });
  }
  if (!label || label.length > 255) {
    return res.status(400).json({ error: 'ValidationError', message: 'label обязателен (≤255 символов)' });
  }
  if (!['measurement', 'self_report', 'instructor_check'].includes(criterion_type)) {
    return res.status(400).json({ error: 'ValidationError', message: 'criterion_type: measurement|self_report|instructor_check' });
  }

  // Type-specific валидация
  if (criterion_type === 'measurement') {
    if (!measurement_type || !measurement_source || !threshold_operator) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Для measurement критерия: measurement_type, measurement_source, threshold_operator обязательны'
      });
    }
    if (!['>=', '<=', '=', '>', '<', 'between'].includes(threshold_operator)) {
      return res.status(400).json({ error: 'ValidationError', message: 'threshold_operator: >=, <=, =, >, <, between' });
    }
    if (threshold_value === undefined || threshold_value === null) {
      return res.status(400).json({ error: 'ValidationError', message: 'threshold_value обязателен для measurement' });
    }
    if (threshold_operator === 'between' && (threshold_value2 === undefined || threshold_value2 === null)) {
      return res.status(400).json({ error: 'ValidationError', message: 'threshold_value2 обязателен для operator between' });
    }
    if (!['rom', 'girth', 'pain'].includes(measurement_source)) {
      return res.status(400).json({ error: 'ValidationError', message: 'measurement_source: rom|girth|pain' });
    }
  }

  if (criterion_type === 'self_report' && !self_report_question) {
    return res.status(400).json({ error: 'ValidationError', message: 'self_report_question обязателен для self_report' });
  }

  try {
    // Проверить существование фазы
    const phaseCheck = await query('SELECT id FROM rehab_phases WHERE id = $1', [phase_id]);
    if (phaseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Фаза не найдена' });
    }

    const { rows } = await query(
      `INSERT INTO phase_transition_criteria (
        phase_id, criterion_code, label, criterion_type,
        measurement_type, measurement_source,
        threshold_operator, threshold_value, threshold_value2, staleness_days,
        self_report_question, self_report_hint,
        position, is_required, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
      RETURNING *`,
      [
        phase_id, criterion_code, label, criterion_type,
        criterion_type === 'measurement' ? measurement_type : null,
        criterion_type === 'measurement' ? measurement_source : null,
        criterion_type === 'measurement' ? threshold_operator : null,
        criterion_type === 'measurement' ? threshold_value : null,
        criterion_type === 'measurement' && threshold_operator === 'between' ? threshold_value2 : null,
        staleness_days ?? 7,
        criterion_type === 'self_report' ? self_report_question : null,
        criterion_type === 'self_report' ? (self_report_hint || null) : null,
        position ?? 0,
        is_required ?? true
      ]
    );

    await logAudit(req, 'create', 'phase_criterion', rows[0].id, { phase_id, criterion_code, criterion_type });

    return res.status(201).json({ data: rows[0], message: 'Критерий создан' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'criterion_code уже существует в этой фазе' });
    }
    console.error('POST /admin/phases/:phase_id/criteria error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось создать критерий' });
  }
});

/**
 * PUT /api/admin/criteria/:id
 * Обновить критерий. phase_id и criterion_code — immutable.
 */
router.put('/criteria/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ValidationError', message: 'id должен быть числом' });
  }

  const {
    label, criterion_type,
    measurement_type, measurement_source,
    threshold_operator, threshold_value, threshold_value2, staleness_days,
    self_report_question, self_report_hint,
    position, is_required, is_active
  } = req.body;

  // Динамический buildPatch
  const sets = [];
  const params = [];
  let idx = 1;

  if (label !== undefined) {
    if (typeof label !== 'string' || !label.length || label.length > 255) {
      return res.status(400).json({ error: 'ValidationError', message: 'label длина 1..255' });
    }
    sets.push(`label = $${idx++}`); params.push(label);
  }
  if (criterion_type !== undefined) {
    if (!['measurement', 'self_report', 'instructor_check'].includes(criterion_type)) {
      return res.status(400).json({ error: 'ValidationError', message: 'criterion_type invalid' });
    }
    sets.push(`criterion_type = $${idx++}`); params.push(criterion_type);
  }
  if (measurement_type !== undefined) { sets.push(`measurement_type = $${idx++}`); params.push(measurement_type); }
  if (measurement_source !== undefined) { sets.push(`measurement_source = $${idx++}`); params.push(measurement_source); }
  if (threshold_operator !== undefined) { sets.push(`threshold_operator = $${idx++}`); params.push(threshold_operator); }
  if (threshold_value !== undefined) { sets.push(`threshold_value = $${idx++}`); params.push(threshold_value); }
  if (threshold_value2 !== undefined) { sets.push(`threshold_value2 = $${idx++}`); params.push(threshold_value2); }
  if (staleness_days !== undefined) { sets.push(`staleness_days = $${idx++}`); params.push(staleness_days); }
  if (self_report_question !== undefined) { sets.push(`self_report_question = $${idx++}`); params.push(self_report_question); }
  if (self_report_hint !== undefined) { sets.push(`self_report_hint = $${idx++}`); params.push(self_report_hint); }
  if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position); }
  if (is_required !== undefined) { sets.push(`is_required = $${idx++}`); params.push(!!is_required); }
  if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!is_active); }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'ValidationError', message: 'Нет полей для обновления' });
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  try {
    const { rows } = await query(
      `UPDATE phase_transition_criteria SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Критерий не найден' });
    }

    await logAudit(req, 'update', 'phase_criterion', id, { changes: req.body });

    return res.json({ data: rows[0], message: 'Критерий обновлён' });
  } catch (err) {
    console.error('PUT /admin/criteria/:id error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось обновить критерий' });
  }
});

/**
 * DELETE /api/admin/criteria/:id
 * Hard delete только если нет ссылок из patient_criterion_answers.
 * Иначе — рекомендуем PUT is_active=false.
 */
router.delete('/criteria/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ValidationError', message: 'id должен быть числом' });
  }

  try {
    const refsCheck = await query(
      `SELECT COUNT(*)::int AS cnt FROM patient_criterion_answers WHERE criterion_id = $1`,
      [id]
    );
    const cnt = refsCheck.rows[0]?.cnt ?? 0;
    if (cnt > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Критерий использован в ${cnt} ответах пациентов. Деактивируйте (is_active=false) вместо удаления.`
      });
    }

    const { rowCount } = await query('DELETE FROM phase_transition_criteria WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Критерий не найден' });
    }

    await logAudit(req, 'delete', 'phase_criterion', id, {});

    return res.json({ data: { id }, message: 'Критерий удалён' });
  } catch (err) {
    console.error('DELETE /admin/criteria/:id error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось удалить критерий' });
  }
});
```

### D) Frontend `services/api.js` — helpers

**Verify-driven (как в 2.02 v2):** Claude Code смотрит как PhasesTab вызывает свои существующие endpoints (`/admin/phases`), копирует тот же стиль:

- Если плоские функции (`listPhases`, `getPhase`, `createPhase`, `updatePhase`, `deletePhase`) — добавляем `listPhaseCriteria(phaseId)`, `createPhaseCriterion(phaseId, data)`, `updateCriterion(id, data)`, `deleteCriterion(id)`.
- Если inline `api.get('/admin/phases/...')` в компоненте — пишем inline для criteria тоже.

**КОПИРУЕМ паттерн, не изобретаем третий стиль.**

### E) Frontend PhasesTab расширение в `AdminContent.js`

**Подход — accordion под каждой фазой.** PhasesTab уже рендерит таблицу/список фаз. Под каждой строкой фазы добавить collapsible "Критерии" секцию.

**State в PhasesTab (добавить):**
```javascript
const [expandedPhase, setExpandedPhase] = useState(null);     // id фазы которая раскрыта
const [criteriaByPhase, setCriteriaByPhase] = useState({});   // { phaseId: [...criteria] }
const [criteriaLoading, setCriteriaLoading] = useState({});
const [editingCriterion, setEditingCriterion] = useState(null);
const [creatingForPhase, setCreatingForPhase] = useState(null);
```

**Загрузка по requested:**
```javascript
const togglePhase = async (phaseId) => {
  if (expandedPhase === phaseId) {
    setExpandedPhase(null);
    return;
  }
  setExpandedPhase(phaseId);
  if (!criteriaByPhase[phaseId]) {
    setCriteriaLoading(prev => ({ ...prev, [phaseId]: true }));
    try {
      const data = await listPhaseCriteria(phaseId);  // или inline api.get
      setCriteriaByPhase(prev => ({ ...prev, [phaseId]: data }));
    } catch (err) {
      toast.error('Не удалось загрузить критерии');
    } finally {
      setCriteriaLoading(prev => ({ ...prev, [phaseId]: false }));
    }
  }
};
```

**UI layout (примерно):**

```
[PhasesTab existing table]
  | Программа | № | Фаза | Длительность | Действия |
  |-----------|---|------|--------------|----------|
  | acl       | 1 | Защита           | 2 недели  | [edit] [crit ▼]  |
  ◄ click "crit ▼" ─────────────────────────────────────────────────────►
  
  ╔ Критерии (5) ═════════════════════════════════════════════════════╗
  ║ [+ Добавить критерий]                                             ║
  ║                                                                   ║
  ║ ┌─ Измерение ──────────────────────────────────────────────────┐ ║
  ║ │ Полное активное разгибание (0°)                              │ ║
  ║ │ knee_extension_degrees = 0°, стенлость 7д                     │ ║
  ║ │ [edit] [del]                                                  │ ║
  ║ └───────────────────────────────────────────────────────────────┘ ║
  ║ ┌─ Измерение ──────────────────────────────────────────────────┐ ║
  ║ │ Боль в покое ≤ 3 по ВАШ                                       │ ║
  ║ │ vas_score <= 3, стенлость 7д                                   │ ║
  ║ │ [edit] [del]                                                  │ ║
  ║ └───────────────────────────────────────────────────────────────┘ ║
  ║ ┌─ Самоотчёт пациента ────────────────────────────────────────┐ ║
  ║ │ Могу передвигаться на костылях с PWB                         │ ║
  ║ │ ❝ Можете передвигаться на костылях...? ❞                      │ ║
  ║ │ Подсказка: Попробуйте несколько шагов по комнате              │ ║
  ║ │ [edit] [del]                                                  │ ║
  ║ └───────────────────────────────────────────────────────────────┘ ║
  ║ ┌─ Проверка инструктором ─────────────────────────────────────┐ ║
  ║ │ Активация квадрицепса присутствует                            │ ║
  ║ │ [edit] [del]                                                  │ ║
  ║ └───────────────────────────────────────────────────────────────┘ ║
  ╚═══════════════════════════════════════════════════════════════════╝
  
  | acl       | 2 | Ранняя мобильность | 4 недели | [edit] [crit ▼] |
  ...
```

**Inline create/edit form для critery — conditional fields:**

```
Тип:                  [select: Измерение / Самоотчёт / Проверка инструктором]
Код:                  [text, disabled при edit]
Название:             [text 255]
Позиция:              [number]
Обязательный:         [checkbox]
Активен:              [checkbox]

─── Если тип = Измерение ───────────────────────────────
  Измеряем:           [select из measurement_types]
  Источник:           [select: ROM / Окружность / Боль]
  Оператор:           [select: ≥ / ≤ / = / > / < / между]
  Значение:           [number]
  Значение 2:         [number — виден только если оператор = между]
  Свежесть (дни):     [number, default 7]

─── Если тип = Самоотчёт ──────────────────────────────
  Вопрос пациенту:    [text 500]
  Подсказка:          [textarea 500, опц.]

─── Если тип = Проверка инструктором ──────────────────
  (никаких дополнительных полей, label достаточно)

[Сохранить] [Отмена]
```

**measurement_type select options** (захардкоженные строки — те что 2.06 будет принимать):
- Колено ROM: `knee_flexion_degrees`, `knee_extension_degrees`, `knee_flexion_hbd_cm`
- Колено окружности: `knee_joint_line_cm`, `knee_suprapatellar_5cm_cm`, `knee_suprapatellar_10cm_cm`, `knee_suprapatellar_15cm_cm`, `knee_calf_max_cm`
- Плечо ROM: `shoulder_forward_flexion_degrees`, `shoulder_abduction_degrees`, `shoulder_er_0_degrees`, `shoulder_ir_90_abd_degrees`, `shoulder_hbb_categorical`
- Плечо окружности: `shoulder_mid_deltoid_cm`, `shoulder_mid_biceps_cm`
- Боль: `vas_score`

**Иконки (lucide-react):**
- `Ruler` для measurement criteria
- `MessageCircleQuestion` для self_report
- `UserCheck` для instructor_check
- `ChevronDown` / `ChevronUp` для accordion toggle
- `Plus`, `Edit2`, `Trash2` для actions

**Toast'ы:**
- `toast.success('Критерий создан')` / `'обновлён'` / `'удалён'`
- `toast.error('Критерий использован в N ответах. Деактивируйте.')` — на DELETE 409

**CSS (alias `s`, AdminContent.module.css extension):**
- `.criteriaPanel` — обёртка accordion
- `.criteriaPanelExpanded` — modifier при раскрытии
- `.criteriaList` — список критериев
- `.criteriaCard` — карточка одного критерия
- `.criteriaTypeBadge` — бейдж типа (measurement/self_report/instructor_check) с иконкой
- `.criteriaForm` — inline edit/create form
- `.criteriaConditionalField` — поля видимые в зависимости от типа

---

## Mock-based тесты

### Backend: `backend/tests/__tests__/admin.routes.test.js` (extend)

```javascript
describe('Admin phase_criteria CRUD (Wave 2 коммит 2.03)', () => {
  // Audit через logAudit helper (admin.js:17) — внутри вызывает query INSERT INTO audit_logs.
  // Тесты проверяют наличие call'а с INSERT audit_logs (любая позиция), не строго [N].

  beforeEach(() => {
    jest.clearAllMocks();
    require('../../middleware/auth').authenticateToken = jest.fn((req, _res, next) => {
      req.user = { id: 1, role: 'admin', is_active: true };
      next();
    });
    require('../../middleware/auth').requireAdmin = jest.fn((req, _res, next) => next());
  });

  it('GET /admin/phases/:phase_id/criteria возвращает список', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, phase_id: 5, criterion_code: 'full_extension', criterion_type: 'measurement' },
        { id: 2, phase_id: 5, criterion_code: 'no_extension_lag', criterion_type: 'instructor_check' }
      ]
    });
    const res = await request(app).get('/api/admin/phases/5/criteria');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET валидация phase_id — non-numeric', async () => {
    const res = await request(app).get('/api/admin/phases/abc/criteria');
    expect(res.status).toBe(400);
  });

  it('POST measurement критерий создаёт + audit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })  // phase check
      .mockResolvedValueOnce({ rows: [{ id: 100, phase_id: 5, criterion_code: 'test', criterion_type: 'measurement' }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({
        criterion_code: 'test', label: 'X', criterion_type: 'measurement',
        measurement_type: 'knee_flexion_degrees', measurement_source: 'rom',
        threshold_operator: '>=', threshold_value: 90
      });
    expect(res.status).toBe(201);
    const auditCall = db.query.mock.calls.find(call => /INSERT INTO audit_logs/.test(call[0]));
    expect(auditCall).toBeDefined();
  });

  it('POST self_report без question — 400', async () => {
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({ criterion_code: 'test', label: 'X', criterion_type: 'self_report' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/self_report_question обязателен/);
  });

  it('POST measurement без threshold — 400', async () => {
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({
        criterion_code: 'test', label: 'X', criterion_type: 'measurement',
        measurement_type: 'knee_flexion_degrees', measurement_source: 'rom'
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/threshold_operator/);
  });

  it('POST measurement between без value2 — 400', async () => {
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({
        criterion_code: 'test', label: 'X', criterion_type: 'measurement',
        measurement_type: 'knee_flexion_degrees', measurement_source: 'rom',
        threshold_operator: 'between', threshold_value: 90
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/threshold_value2/);
  });

  it('POST instructor_check минимальный body', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 101, criterion_type: 'instructor_check' }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({ criterion_code: 'test', label: 'X', criterion_type: 'instructor_check' });
    expect(res.status).toBe(201);
  });

  it('POST фаза не существует — 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/admin/phases/99999/criteria')
      .send({ criterion_code: 'test', label: 'X', criterion_type: 'instructor_check' });
    expect(res.status).toBe(404);
  });

  it('POST 409 при дубле criterion_code в фазе', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockRejectedValueOnce({ code: '23505' });
    const res = await request(app)
      .post('/api/admin/phases/5/criteria')
      .send({ criterion_code: 'full_extension', label: 'X', criterion_type: 'instructor_check' });
    expect(res.status).toBe(409);
  });

  it('PUT обновляет label', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, label: 'Обновлено' }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/admin/criteria/1').send({ label: 'Обновлено' });
    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe('Обновлено');
  });

  it('PUT 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/admin/criteria/99999').send({ label: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE 409 если есть ответы пациентов', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ cnt: 3 }] });
    const res = await request(app).delete('/api/admin/criteria/1');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/в 3 ответах/);
  });

  it('DELETE успешно при отсутствии ссылок + audit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValue({ rows: [] });
    const res = await request(app).delete('/api/admin/criteria/1');
    expect(res.status).toBe(200);
    const auditCall = db.query.mock.calls.find(call => /INSERT INTO audit_logs/.test(call[0]));
    expect(auditCall).toBeDefined();
  });
});
```

### Backend: `backend/tests/__tests__/wave2_schema.test.js` (extend)

```javascript
describe('Wave 2 ACL criteria seed (коммит 2.03)', () => {
  const seedPath = path.join(__dirname, '../../database/migrations/20260518_acl_criteria_seed.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(seedPath, 'utf8');
  });

  it('содержит критерии для всех 6 фаз', () => {
    // Проверка через присутствие (phase_number, ...) маркеров
    for (let n = 1; n <= 6; n++) {
      expect(sql).toMatch(new RegExp(`\\(${n}, '`));
    }
  });

  it('содержит ~30 критериев (24-32 row count)', () => {
    // Считаем VALUES rows — паттерн `(<digit>, '<code>',`
    const matches = sql.match(/\(\d+,\s*'[a-z_]+',/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(24);
    expect(matches.length).toBeLessThanOrEqual(32);
  });

  it('содержит все 3 типа критериев', () => {
    expect(sql).toMatch(/'measurement'/);
    expect(sql).toMatch(/'self_report'/);
    expect(sql).toMatch(/'instructor_check'/);
  });

  it('JOIN на rehab_phases с program_type=acl', () => {
    expect(sql).toMatch(/JOIN rehab_phases[\s\S]+?program_type\s*=\s*'acl'/);
  });

  it('идемпотентность ON CONFLICT DO NOTHING', () => {
    expect(sql).toMatch(/ON CONFLICT \(phase_id, criterion_code\) DO NOTHING/);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });
});
```

### Frontend: `frontend/src/pages/Admin/AdminPanel.test.js` (extend)

```javascript
describe('PhasesTab criteria sub-CRUD (Wave 2 коммит 2.03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../../services/api').listPhases = jest.fn().mockResolvedValue([
      { id: 5, program_type: 'acl', phase_number: 1, title: 'Защита', duration_weeks: 2 },
      { id: 6, program_type: 'acl', phase_number: 2, title: 'Ранняя мобильность', duration_weeks: 4 }
    ]);
    require('../../services/api').listPhaseCriteria = jest.fn().mockResolvedValue([
      { id: 1, phase_id: 5, criterion_code: 'full_extension', label: 'Полное разгибание', criterion_type: 'measurement', measurement_type: 'knee_extension_degrees', threshold_operator: '=', threshold_value: 0 },
      { id: 2, phase_id: 5, criterion_code: 'pwb_ambulation', label: 'Передвижение на костылях', criterion_type: 'self_report', self_report_question: 'Можете передвигаться?' },
      { id: 3, phase_id: 5, criterion_code: 'quad_activation', label: 'Активация квадрицепса', criterion_type: 'instructor_check' }
    ]);
    require('../../services/api').createPhaseCriterion = jest.fn().mockResolvedValue({ id: 100 });
    require('../../services/api').updateCriterion = jest.fn().mockResolvedValue({ id: 1 });
    require('../../services/api').deleteCriterion = jest.fn().mockResolvedValue({ id: 1 });
  });

  it('рендерит таб phases с фазами после загрузки', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => {
      expect(screen.getByText('Защита')).toBeInTheDocument();
    });
  });

  it('клик "crit ▼" раскрывает критерии фазы и вызывает listPhaseCriteria', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => {
      expect(listPhaseCriteria).toHaveBeenCalledWith(5);
      expect(screen.getByText('Полное разгибание')).toBeInTheDocument();
    });
  });

  it('измерительный критерий показывает threshold info', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => {
      const card = screen.getByText('Полное разгибание').closest('[data-testid="criterion-card"]');
      expect(card).toHaveTextContent(/knee_extension_degrees/);
      expect(card).toHaveTextContent(/=/);
      expect(card).toHaveTextContent(/0/);
    });
  });

  it('self_report критерий показывает вопрос', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Можете передвигаться/)).toBeInTheDocument();
    });
  });

  it('create form: смена criterion_type показывает/прячет условные поля', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));
    fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));

    // Default — measurement, видны threshold поля
    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'measurement' } });
    expect(screen.getByLabelText(/Оператор/i)).toBeInTheDocument();

    // Переключение на self_report
    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'self_report' } });
    expect(screen.queryByLabelText(/Оператор/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Вопрос пациенту/i)).toBeInTheDocument();

    // Переключение на instructor_check
    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'instructor_check' } });
    expect(screen.queryByLabelText(/Вопрос пациенту/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Оператор/i)).not.toBeInTheDocument();
  });

  it('between operator показывает второе поле value', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));
    fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));

    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'measurement' } });
    fireEvent.change(screen.getByLabelText(/Оператор/i), { target: { value: 'between' } });
    expect(screen.getByLabelText(/Значение 2/i)).toBeInTheDocument();
  });

  it('создание measurement критерия вызывает createPhaseCriterion', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));
    fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));

    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'measurement' } });
    fireEvent.change(screen.getByLabelText('Код'), { target: { value: 'new_crit' } });
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новый' } });
    fireEvent.change(screen.getByLabelText(/Измеряем/i), { target: { value: 'knee_flexion_degrees' } });
    fireEvent.change(screen.getByLabelText(/Источник/i), { target: { value: 'rom' } });
    fireEvent.change(screen.getByLabelText(/Оператор/i), { target: { value: '>=' } });
    fireEvent.change(screen.getByLabelText(/Значение$/i), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/i }));

    await waitFor(() => {
      expect(createPhaseCriterion).toHaveBeenCalledWith(5, expect.objectContaining({
        criterion_code: 'new_crit',
        criterion_type: 'measurement',
        measurement_type: 'knee_flexion_degrees',
        threshold_operator: '>=',
        threshold_value: 90
      }));
    });
  });

  it('delete с 409 (есть ответы пациентов) — toast с подсказкой', async () => {
    deleteCriterion.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Критерий использован в 3 ответах…' } }
    });
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => screen.getByText('Полное разгибание'));
    const deleteBtns = screen.getAllByRole('button', { name: /Удалить/i });
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByRole('button', { name: /Подтвердить|OK|Да/i }));
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringMatching(/в 3 ответах/) })
      );
    });
  });

  it('edit form: code, criterion_type — disabled при edit', async () => {
    render(<AdminContent tab="phases" />);
    await waitFor(() => screen.getByText('Защита'));
    fireEvent.click(screen.getAllByRole('button', { name: /критер|crit/i })[0]);
    await waitFor(() => screen.getByText('Полное разгибание'));
    const editBtns = screen.getAllByRole('button', { name: /Редактировать|Edit/i });
    fireEvent.click(editBtns[0]);
    expect(screen.getByLabelText('Код')).toBeDisabled();
    expect(screen.getByLabelText('Тип')).toBeDisabled();
  });
});
```

---

## NOT TOUCH

- Существующие phases endpoints / поведение PhasesTab (только расширение)
- PainLocationsTab (2.02, на feature-ветке)
- Patient frontend / endpoints
- `phase_transition_criteria` schema (только seed, не ALTER)
- `patient_criterion_answers` CRUD endpoints (это 2.12)
- LOCKED-зоны (ExerciseRunner v4, OAuth flow, PatientDashboard pd-*)
- 4 dirty dark-theme файлов

---

## Smoke test

### Сценарий 1 — миграция применилась

```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260518_acl_criteria_seed.sql

# Проверить распределение по фазам
psql -U postgres -d azarean_rehab -c "
  SELECT p.phase_number, p.title, COUNT(c.id) AS criteria_count
  FROM rehab_phases p
  LEFT JOIN phase_transition_criteria c ON c.phase_id = p.id
  WHERE p.program_type = 'acl'
  GROUP BY p.id, p.phase_number, p.title
  ORDER BY p.phase_number;
"
```

**Ожидание:** 6 строк, в каждой 4-6 критериев, итого ~28-30.

```bash
# Распределение по типам
psql -U postgres -d azarean_rehab -c "
  SELECT criterion_type, COUNT(*) FROM phase_transition_criteria GROUP BY criterion_type;
"
```

**Ожидание:** видны все 3 типа.

### Сценарий 2 — Идемпотентность

```bash
# Запустить ещё раз — должна пройти без ошибок
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260518_acl_criteria_seed.sql

# Изменить через psql
psql -U postgres -d azarean_rehab -c "UPDATE phase_transition_criteria SET label='Изменено' WHERE criterion_code='full_extension';"

# Re-run
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260518_acl_criteria_seed.sql

# Проверить что изменение НЕ перетёрто
psql -U postgres -d azarean_rehab -c "SELECT label FROM phase_transition_criteria WHERE criterion_code='full_extension';"
```

**Ожидание:** `Изменено`.

### Сценарий 3 — Admin endpoints через curl

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vadim@azarean.com","password":"Test1234"}' | jq -r '.data.token')

# Найти id phase 1 для ACL
PHASE_ID=$(psql -U postgres -d azarean_rehab -t -A -c "SELECT id FROM rehab_phases WHERE program_type='acl' AND phase_number=1;")

# GET список критериев phase 1
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/phases/$PHASE_ID/criteria" | jq '.data | length'
# Ожидание: ~5

# POST новый критерий — measurement
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "criterion_code": "test_crit",
    "label": "Тест",
    "criterion_type": "measurement",
    "measurement_type": "knee_flexion_degrees",
    "measurement_source": "rom",
    "threshold_operator": ">=",
    "threshold_value": 100
  }' \
  "http://localhost:5000/api/admin/phases/$PHASE_ID/criteria" | jq

# POST self_report без question — 400
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"criterion_code":"test2","label":"X","criterion_type":"self_report"}' \
  "http://localhost:5000/api/admin/phases/$PHASE_ID/criteria" | jq

# DELETE созданный
CRIT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/admin/phases/$PHASE_ID/criteria" | jq -r '.data[] | select(.criterion_code=="test_crit") | .id')
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/admin/criteria/$CRIT_ID" | jq
```

### Сценарий 4 — UI smoke

1. Login админом → Контент → таб «Фазы»
2. Видны 6 ACL фаз (или больше если есть shoulder_general фазы)
3. Click "критерии ▼" на Phase 1 → accordion раскрылся → видны 5 критериев Phase 1
4. Видны разные badge'ы для measurement / self_report / instructor_check (разные иконки)
5. "+ Добавить критерий" → форма открылась, default type=measurement, видны threshold поля
6. Переключи type на self_report → threshold поля исчезли, появилось «Вопрос пациенту»
7. Заполни self_report критерий → save → toast «Создан» → виден в списке
8. Edit measurement критерий → измени threshold → save → toast «Обновлён»
9. Delete тестовый → confirm → toast «Удалён»
10. Попытка delete критерия с patient_criterion_answers (если есть) → 409 с подсказкой

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260518_acl_criteria_seed.sql`
- `backend/database/seeds/acl_criteria.sql` (зеркальная копия)

### Изменить
- `backend/routes/admin.js` (+~150 строк, 4 endpoints)
- `backend/tests/__tests__/admin.routes.test.js` (+~12 тестов)
- `backend/tests/__tests__/wave2_schema.test.js` (+~6 тестов для seed)
- `frontend/src/services/api.js` (verify-driven, паттерн из PhasesTab)
- `frontend/src/pages/Admin/AdminContent.js` (+~250-300 строк PhasesTab расширение)
- `frontend/src/pages/Admin/AdminContent.module.css` (+camelCase classes для criteria UI)
- `frontend/src/pages/Admin/AdminPanel.test.js` (+~10 тестов)
- `CLAUDE.md` (migrations list + admin endpoints + completed fixes)

### НЕ ТРОГАТЬ
- `backend/database/schema.sql`
- Существующие phases endpoints
- PainLocationsTab (на другой feature-ветке)
- LOCKED-зоны

---

## Текст коммита

```
feat(admin): Wave 2 — ACL criteria seed + PhasesTab criteria sub-CRUD

Wave 2 коммит 2.03 — Block A Foundation final. Заполняет
phase_transition_criteria default ACL-критериями и расширяет PhasesTab
inline CRUD для критериев под каждой фазой.

Backend:
- Migration 20260518_acl_criteria_seed.sql — ~30 idempotent INSERTs через
  WITH clause + JOIN на rehab_phases. Распределены по 6 ACL фазам (4-6
  критериев на фазу), три типа: measurement / self_report / instructor_check.
  ON CONFLICT DO NOTHING — сохраняет правки Vadim'а при re-run.
- routes/admin.js — 4 endpoints:
  GET /admin/phases/:phase_id/criteria (list+filter),
  POST /admin/phases/:phase_id/criteria (create),
  PUT /admin/criteria/:id (update),
  DELETE /admin/criteria/:id (hard delete если no patient_criterion_answers refs,
    иначе 409 с рекомендацией is_active=false).
  Все CUD с logAudit helper (admin.js:17), entity_type='phase_criterion'.
  Type-specific валидация (measurement требует threshold, self_report —
  question, between — value2).

Frontend:
- services/api.js — helpers по паттерну existing PhasesTab вызовов
  (verify-driven, не вводит новый xxxAdmin namespace).
- AdminContent.js — PhasesTab расширен accordion-секцией под каждой
  фазой. Three-type conditional form (measurement → threshold fields,
  self_report → question+hint, instructor_check → label only).
  Lucide-react icons (Ruler/MessageCircleQuestion/UserCheck) для type badges.
- AdminContent.module.css — camelCase classes для criteriaPanel /
  criteriaCard / criteriaForm.

Seed — медицинский draft из AAOS/APTA guidelines. Vadim ревьюит и
калибрует через UI после деплоя.

Tests:
- backend +12 admin routes + 6 seed sanity
- frontend +10 PhasesTab criteria UI

Закрывает Block A Foundation. Wave 2 Block B (Pain tracking) — следующим.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- Секция «Запуск проекта → PostgreSQL» — добавить миграцию `20260518_acl_criteria_seed`
- Секция «API endpoints → Admin» — добавить:
  ```
  | GET    | /api/admin/phases/:phase_id/criteria | JWT + Admin | Список критериев фазы |
  | POST   | /api/admin/phases/:phase_id/criteria | JWT + Admin | Создать |
  | PUT    | /api/admin/criteria/:id              | JWT + Admin | Обновить |
  | DELETE | /api/admin/criteria/:id              | JWT + Admin | Удалить (409 если есть refs) |
  ```
- Секция «Завершённые исправления» — запись:
  > **Wave 2 коммит 2.03** — ACL criteria seed (~30 records по 6 фазам) + PhasesTab criteria sub-CRUD. Three-type conditional form. logAudit для всех CUD. DELETE защищён от refs из patient_criterion_answers. Закрыт Block A Foundation.

**Memory:**
- `wave_2_progress.md` — статус 2.03 → ⏸ заморожен, SHA, дата, smoke ok
- Block A полностью отмечен как готовый к batch merge (но НЕ мерджим ещё)

---

## Definition of Done

- [ ] Verify-step выполнен: 6 ACL фаз подтверждены, PhasesTab структура понятна, паттерн api.js вызовов выявлен
- [ ] Миграция `20260518_acl_criteria_seed.sql` создана, idempotency проверена (ручное UPDATE сохраняется)
- [ ] ~28-30 критериев распределены по 6 фазам (4-6 на фазу), 3 типа представлены
- [ ] 4 admin endpoints работают через curl (GET list, POST measurement/self_report/instructor_check, PUT, DELETE 409 + 200)
- [ ] Type-specific валидация: measurement без threshold → 400, self_report без question → 400, between без value2 → 400
- [ ] logAudit вызывается на CUD (entity_type='phase_criterion')
- [ ] PhasesTab accordion раскрывает критерии по клику, list загружается через listPhaseCriteria
- [ ] Three-type conditional form в create/edit работает корректно (поля скрываются/появляются)
- [ ] edit form блокирует `criterion_code` и `criterion_type` (immutable)
- [ ] Toast feedback на create/update/delete + специальный на 409
- [ ] CSS Modules — используется alias `s`, новые классы camelCase
- [ ] Все тесты зелёные: backend +12+6=+18, frontend +10
- [ ] Existing tests не сломаны (после 2.01+2.02+2.03: backend ≥ 487, frontend ≥ 270)
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By trailer
- [ ] `wave_2_progress.md` — статус 2.03 → ⏸ заморожен, Block A complete (но НЕ merged)
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт от ветки `wave-2/03-criteria-admin-seed`, висит до конца Wave 2

---

## После 2.03

Block A Foundation **полностью готов к batch merge** (3 PR висят открытыми). Следующий шаг — Block B Pain tracking:
- 2.04 — Backend pain endpoints (daily + event) + red flag automation + ops-alert
- 2.05 — Frontend DiaryScreen расширенный + Pain Event SOS

Архитектор напишет TZ 2.04+2.05 батчем после получения сигнала «2.03 ⏸».
