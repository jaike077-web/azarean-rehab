# TZ Wave 2 · Коммит 2.04 — Backend pain endpoints + red flag automation (v3)

**Дата:** 2026-05-16, переработано 2026-05-18
**Версия:** v3 — полный rewrite после verify-step Claude Code от 2026-05-18. v2 отозвана из-за 8 premise drifts. Учтены 4 уточнения от Vadim'а.
**Roadmap:** Wave 2 Block B (Pain tracking)
**Цель:** Backend для structured pain tracking с двумя modes:
- **Daily diary** (1 в день, UPSERT) — для DiaryScreen в 2.05
- **Event SOS** (многократно за день, INSERT) — для Pain Event SOS в 2.05

Red-flag automation через **существующий** `utils/opsAlert.js`. `ops_alerts` таблица — медицинский incident-журнал для admin triage.

**Объём:** 6-8 часов
**Риск:** средний — UPSERT через SELECT FOR UPDATE, переиспользование infrastructure, два пути POST.

---

## Главные изменения v3 vs v2

| # | Аспект | v2 (отозвана) | v3 |
|---|---|---|---|
| 1 | Колонка notes | `free_text` ❌ | `notes` ✅ |
| 2 | vas_score | optional ❌ | NOT NULL CHECK 0..10 ✅ |
| 3 | Telegram | НОВЫЙ `services/opsAlerts.js` ❌ | Переиспользование `utils/opsAlert.js` ✅ |
| 4 | env var | `OPS_ALERT_CHAT_ID` ❌ | `OPS_CHAT_ID` (существующий) ✅ |
| 5 | bot ref | `require('../bot/instance').bot` ❌ | НЕТ — через `sendOpsAlert()` ✅ |
| 6 | patient id | `req.user.patient_id` ❌ | `req.patient.id` ✅ |
| 7 | endpoints | один POST /pain ❌ | два: /pain/daily (UPSERT) + /pain/event (INSERT) ✅ |
| 8 | UPSERT | отсутствовал | SELECT FOR UPDATE → UPDATE/INSERT (race-safe) ✅ |
| 9 | red_flag_triggered/ops_alert_sent_at | отсутствовали | UPDATE после `await sendOpsAlert()` ✅ |
| 10 | source_entity_id | telegram-tracker | = pain_entry.id для JOIN ✅ |
| 11 | history filter | без | `?type=daily\|event\|all` ✅ |
| 12 | audit verbs | lowercase ❌ | UPPERCASE ✅ |
| 13 | доп. колонки | игнорировались | program_id, trigger_type, pain_character, photo_url — поддерживаются ✅ |

---

## Verify-step (минимизирован — Claude Code уже знает основное)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) Stack
git log --oneline | head -6
# Ожидание: e6f11a9 → 98ca5f2 → 82544c0 → a6f7980 → af313b4 → main

# 2) Полная schema pain_entries
psql -U postgres -d azarean_rehab -c "\d pain_entries"
# Ожидание: id, patient_id, program_id, entry_date NOT NULL DEFAULT CURRENT_DATE,
# is_event NOT NULL, vas_score NOT NULL CHECK 0..10, notes, trigger_type,
# pain_character TEXT[], photo_url, red_flag_triggered DEFAULT FALSE,
# ops_alert_sent_at, created_at, updated_at
# UNIQUE (patient_id, entry_date) WHERE is_event = FALSE

# 3) sendOpsAlert сигнатур
head -80 backend/utils/opsAlert.js
grep -n "module.exports\|^function sendOpsAlert\|^async function sendOpsAlert" backend/utils/opsAlert.js
# Ожидание: sendOpsAlert(title, body) — запиши точный сигнатур

# 4) patientAuth middleware
grep -n "req\.patient\s*=" backend/middleware/patientAuth.js
# Ожидание: req.patient = decoded payload

# 5) Связь patient → program_type
grep -rn "patient_programs\|program_type" backend/database/migrations/*.sql 2>/dev/null | head -10
psql -U postgres -d azarean_rehab -c "\dt patient_programs" 2>&1 | head -3
# Варианты: A) patients.program_type, B) patient_programs JOIN, C) complexes.diagnosis_id
# Claude Code адаптирует /my/pain-locations endpoint под фактическое

# 6) Существующие /my/* endpoints — паттерн
grep -n "router\.\(get\|post\)(['\"]/my/" backend/routes/rehab.js | head -15

# 7) Pain endpoints отсутствуют
grep -rn "/my/pain\|/api/admin/ops-alerts" backend/routes/ 2>/dev/null
# Ожидание: 0

# 8) ops_alerts table отсутствует (мы создаём)
psql -U postgres -d azarean_rehab -c "\dt ops_alerts" 2>&1 | head -3
# Ожидание: relation does not exist

# 9) Test patient #14 — программа
psql -U postgres -d azarean_rehab -c "SELECT id, full_name FROM patients WHERE id = 14;"
```

**Если grep покажет:**
- `sendOpsAlert(payload)` принимает объект — адаптируй `triggerRedFlagAlert` helper
- patient → program lookup через `patient_programs` — endpoint JOIN'ит её
- В schema ЕЩЁ колонки — НЕ игнорируй, добавь в INSERT

---

## Зависимости

- 2.01-2.03 ⏸, hot-fix #7 + #8 ⏸ — все в stack'е
- `utils/opsAlert.js` (Wave 1 fix #50) — переиспользуем

**Ветка:** `wave-2/04-pain-backend` от `wave-2/hotfix-08-orphan-classname-audit` (e6f11a9)

---

## ❌ НЕ СОЗДАЁМ — критично!

| Артефакт | Почему нет |
|---|---|
| ❌ `backend/services/opsAlerts.js` | Дубль `utils/opsAlert.js` |
| ❌ env `OPS_ALERT_CHAT_ID` | Существует `OPS_CHAT_ID` |
| ❌ `require('../bot/instance')` | Нет такого, через `sendOpsAlert()` |
| ❌ Telegram retry/dedup logic | Уже в `utils/opsAlert.js` |
| ❌ Колонки `telegram_message_id`, `telegram_chat_id`, `telegram_sent_at`, `telegram_send_error` в ops_alerts | Detail в utils/opsAlert.js |

## ✅ ИСПОЛЬЗУЕМ — переиспользование

| Что | Откуда |
|---|---|
| `sendOpsAlert(title, body)` | `backend/utils/opsAlert.js` |
| dedup hash + hourly cap | внутри `utils/opsAlert.js` |
| `OPS_CHAT_ID=183943760` | существующий .env |
| `OPS_BOT_TOKEN` | существующий .env |
| `req.patient.id` | `middleware/patientAuth.js` |
| `logAudit(req, action, ...)` UPPERCASE | `routes/admin.js:17` |

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `backend/database/migrations/20260519_ops_alerts.sql` | НОВЫЙ — slim таблица |
| `backend/routes/rehab.js` | EXTEND — 4 endpoints + helper `triggerRedFlagAlert` inline (~320 строк) |
| `backend/routes/admin.js` | EXTEND — 2 endpoints для ops-alerts (~80 строк) |
| `backend/tests/__tests__/rehab.pain.test.js` | НОВЫЙ — ~24 теста |
| `backend/tests/__tests__/admin.routes.test.js` | EXTEND — ~6 тестов |
| `CLAUDE.md` | UPDATE |

**НЕ ТРОГАТЬ:** `utils/opsAlert.js`, `services/telegramBot.js`, Frontend, LOCKED-зоны, JARVIS.

---

## Конкретная реализация

### A) Migration: `backend/database/migrations/20260519_ops_alerts.sql`

```sql
-- Wave 2 коммит 2.04 — ops_alerts (SLIM)
-- Telegram отправка и dedup — в utils/opsAlert.js (Wave 1 fix #50, не дублируем).
-- Эта таблица — incident-журнал для admin triage с resolve flow.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_alerts (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  alert_type      VARCHAR(50) NOT NULL,
  severity        VARCHAR(20) NOT NULL DEFAULT 'high',
  source_entity_type VARCHAR(50),                  -- 'pain_entry'
  source_entity_id   INTEGER,                      -- pain_entries.id для JOIN'а в админке
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_attempted_at TIMESTAMP,                 -- когда trigger'нули sendOpsAlert
  telegram_dedup_key    VARCHAR(255),
  resolved_at         TIMESTAMP,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes    TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_resolved_pair CHECK (
    (resolved_at IS NULL AND resolved_by_user_id IS NULL) OR
    (resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_unresolved
  ON ops_alerts (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_patient
  ON ops_alerts (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_source
  ON ops_alerts (source_entity_type, source_entity_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_ops_alerts_updated
             BEFORE UPDATE ON ops_alerts
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
```

### B) Helper `triggerRedFlagAlert` (inline в `routes/rehab.js`)

```javascript
const { sendOpsAlert } = require('../utils/opsAlert');

/**
 * Helper: trigger red-flag pain alert.
 * - sendOpsAlert(title, body) — fire-and-forget, дедуп+hourly cap в utils
 * - INSERT ops_alerts с source_entity_id=pain_entry.id для admin triage
 * - Возвращает ops_alert.id (или null если INSERT упал)
 */
async function triggerRedFlagAlert({ patient, pain_entry, locations_data, red_flag_locs, is_event }) {
  const modeLabel = is_event ? 'Pain Event' : 'Daily diary';
  const title = `🚨 RED FLAG: ${patient.full_name || 'Пациент'} (ID ${patient.id})`;
  const redFlagDescriptions = red_flag_locs
    .map(l => `• ${l.label} — ${l.red_flag_reason || 'причина не указана'}`)
    .join('\n');
  const notesLine = pain_entry.notes ? `\nЗаметка: ${pain_entry.notes}` : '';
  const triggerLine = pain_entry.trigger_type ? `\nТриггер: ${pain_entry.trigger_type}` : '';
  const phoneLine = patient.phone ? `\nТелефон: ${patient.phone}` : '';

  const body = (
    `Режим: ${modeLabel}\n` +
    `VAS: ${pain_entry.vas_score}/10\n` +
    `Локации с красным флагом:\n${redFlagDescriptions}` +
    triggerLine + notesLine + phoneLine +
    `\n\nДействие: связаться с пациентом, оценить состояние.\n` +
    `Pain entry ID: ${pain_entry.id} (${new Date(pain_entry.created_at).toLocaleString('ru-RU')})`
  );

  // await sendOpsAlert — fire-and-forget с dedup внутри utils
  try {
    await sendOpsAlert(title, body);
  } catch (err) {
    console.error('[triggerRedFlagAlert] sendOpsAlert threw:', err);
  }

  // INSERT в ops_alerts для admin triage
  try {
    const { rows } = await query(
      `INSERT INTO ops_alerts
         (patient_id, alert_type, severity, source_entity_type, source_entity_id,
          details, telegram_attempted_at)
       VALUES ($1, 'red_flag_pain', 'high', 'pain_entry', $2, $3, NOW())
       RETURNING id`,
      [
        patient.id,
        pain_entry.id,
        JSON.stringify({
          vas_score: pain_entry.vas_score,
          notes: pain_entry.notes,
          trigger_type: pain_entry.trigger_type,
          is_event,
          red_flag_locations: red_flag_locs.map(l => ({
            code: l.code, label: l.label, reason: l.red_flag_reason
          }))
        })
      ]
    );
    return rows[0].id;
  } catch (err) {
    console.error('[triggerRedFlagAlert] ops_alerts INSERT failed:', err);
    return null;
  }
}
```

### C) `routes/rehab.js` — 4 endpoints

```javascript
// ============================================================================
// PAIN endpoints (Wave 2 коммит 2.04)
// ============================================================================

/**
 * GET /api/rehab/my/pain-locations
 * Active локации боли для program_type пациента.
 */
router.get('/my/pain-locations', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;

    // VERIFY-STEP: адаптировать под фактический pattern patient → program_type
    // Default (вариант B — patient_programs):
    const ptRes = await query(
      `SELECT program_type FROM patient_programs
       WHERE patient_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );
    // Если verify-step показал вариант A (patients.program_type) — упростить:
    //   `SELECT program_type FROM patients WHERE id = $1`

    const programType = ptRes.rows[0]?.program_type;
    if (!programType) {
      return res.json({ data: [], total: 0 });
    }

    const { rows } = await query(
      `SELECT code, program_type, label, position, is_red_flag
       FROM pain_locations
       WHERE program_type = $1 AND is_active = TRUE
       ORDER BY position, code`,
      [programType]
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /rehab/my/pain-locations error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить локации' });
  }
});

/**
 * POST /api/rehab/my/pain/daily
 * UPSERT daily entry через SELECT FOR UPDATE → UPDATE/INSERT (race-safe).
 * Body: { vas_score (required, 0..10), notes?, location_codes?, pain_character?, program_id? }
 */
router.post('/my/pain/daily', authenticatePatient, async (req, res) => {
  const { vas_score, notes, location_codes, pain_character, program_id } = req.body;

  // Валидация
  if (typeof vas_score !== 'number' || vas_score < 0 || vas_score > 10) {
    return res.status(400).json({ error: 'ValidationError', message: 'vas_score обязателен (число 0..10)' });
  }
  if (notes && (typeof notes !== 'string' || notes.length > 1000)) {
    return res.status(400).json({ error: 'ValidationError', message: 'notes ≤ 1000 символов' });
  }
  if (location_codes !== undefined) {
    if (!Array.isArray(location_codes) || location_codes.length > 16) {
      return res.status(400).json({ error: 'ValidationError', message: 'location_codes — массив до 16' });
    }
  }
  if (pain_character !== undefined && !Array.isArray(pain_character)) {
    return res.status(400).json({ error: 'ValidationError', message: 'pain_character — массив' });
  }

  const patientId = req.patient.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Locations check
    let locsFound = [];
    if (location_codes && location_codes.length > 0) {
      const locsRes = await client.query(
        `SELECT code, label, is_red_flag, red_flag_reason
         FROM pain_locations
         WHERE code = ANY($1) AND is_active = TRUE`,
        [location_codes]
      );
      locsFound = locsRes.rows;
      const found = new Set(locsFound.map(l => l.code));
      const missing = location_codes.filter(c => !found.has(c));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'ValidationError',
          message: `Неизвестные/неактивные локации: ${missing.join(', ')}`
        });
      }
    }

    const redFlagLocs = locsFound.filter(l => l.is_red_flag);
    const redFlagTriggered = redFlagLocs.length > 0;

    // SELECT FOR UPDATE — race-safe lookup
    const existingRes = await client.query(
      `SELECT id, created_at, red_flag_triggered
       FROM pain_entries
       WHERE patient_id = $1 AND entry_date = CURRENT_DATE AND is_event = FALSE
       FOR UPDATE`,
      [patientId]
    );

    let painEntry;
    if (existingRes.rows.length > 0) {
      // UPDATE existing
      const existingId = existingRes.rows[0].id;
      const prevRedFlag = existingRes.rows[0].red_flag_triggered;
      const upRes = await client.query(
        `UPDATE pain_entries
         SET vas_score = $1, notes = $2, pain_character = $3, program_id = $4,
             red_flag_triggered = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          vas_score, notes ?? null, pain_character ?? null, program_id ?? null,
          prevRedFlag || redFlagTriggered,  // sticky
          existingId
        ]
      );
      painEntry = upRes.rows[0];
    } else {
      // INSERT new
      const insRes = await client.query(
        `INSERT INTO pain_entries
           (patient_id, program_id, entry_date, is_event,
            vas_score, notes, pain_character, red_flag_triggered)
         VALUES ($1, $2, CURRENT_DATE, FALSE, $3, $4, $5, $6)
         RETURNING *`,
        [
          patientId, program_id ?? null,
          vas_score, notes ?? null, pain_character ?? null,
          redFlagTriggered
        ]
      );
      painEntry = insRes.rows[0];
    }

    // Locations: clear old + insert new
    await client.query(
      `DELETE FROM pain_entry_locations WHERE pain_entry_id = $1`,
      [painEntry.id]
    );
    for (const loc of locsFound) {
      await client.query(
        `INSERT INTO pain_entry_locations (pain_entry_id, location_code) VALUES ($1, $2)`,
        [painEntry.id, loc.code]
      );
    }

    await client.query('COMMIT');

    // Red-flag automation — после COMMIT
    let opsAlertId = null;
    if (redFlagTriggered) {
      const patRes = await query(
        `SELECT id, full_name, phone, email FROM patients WHERE id = $1`,
        [patientId]
      );
      opsAlertId = await triggerRedFlagAlert({
        patient: patRes.rows[0],
        pain_entry: painEntry,
        locations_data: locsFound,
        red_flag_locs: redFlagLocs,
        is_event: false
      });

      // UPDATE ops_alert_sent_at ПОСЛЕ sendOpsAlert (Vadim's уточнение #2)
      if (opsAlertId) {
        await query(
          `UPDATE pain_entries SET ops_alert_sent_at = NOW() WHERE id = $1`,
          [painEntry.id]
        );
      }
    }

    return res.status(201).json({
      data: {
        ...painEntry,
        locations: locsFound.map(l => ({
          code: l.code, label: l.label, is_red_flag: l.is_red_flag
        })),
        ops_alert_id: opsAlertId
      },
      message: redFlagTriggered
        ? 'Запись в дневнике сохранена. Куратор получит уведомление о красном флаге.'
        : 'Запись в дневнике сохранена'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /rehab/my/pain/daily error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось сохранить запись' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/rehab/my/pain/event
 * INSERT event SOS. Многократно за день. is_event=TRUE (не подпадает под UNIQUE).
 * Body: { vas_score (req), location_codes (req, ≥1), notes?, trigger_type?, pain_character?, photo_url?, program_id? }
 */
router.post('/my/pain/event', authenticatePatient, async (req, res) => {
  const {
    vas_score, location_codes, notes, trigger_type, pain_character, photo_url, program_id
  } = req.body;

  // Валидация — event'у location_codes обязательны (отличие от daily)
  if (typeof vas_score !== 'number' || vas_score < 0 || vas_score > 10) {
    return res.status(400).json({ error: 'ValidationError', message: 'vas_score обязателен (0..10)' });
  }
  if (!Array.isArray(location_codes) || location_codes.length === 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'location_codes обязательны для pain event (минимум 1)'
    });
  }
  if (location_codes.length > 16) {
    return res.status(400).json({ error: 'ValidationError', message: 'не больше 16 локаций' });
  }
  if (notes && notes.length > 1000) {
    return res.status(400).json({ error: 'ValidationError', message: 'notes ≤ 1000' });
  }
  if (trigger_type && (typeof trigger_type !== 'string' || trigger_type.length > 100)) {
    return res.status(400).json({ error: 'ValidationError', message: 'trigger_type ≤ 100' });
  }
  if (photo_url && (typeof photo_url !== 'string' || photo_url.length > 500)) {
    return res.status(400).json({ error: 'ValidationError', message: 'photo_url ≤ 500' });
  }
  if (pain_character !== undefined && !Array.isArray(pain_character)) {
    return res.status(400).json({ error: 'ValidationError', message: 'pain_character — массив' });
  }

  const patientId = req.patient.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const locsRes = await client.query(
      `SELECT code, label, is_red_flag, red_flag_reason
       FROM pain_locations
       WHERE code = ANY($1) AND is_active = TRUE`,
      [location_codes]
    );
    const locsFound = locsRes.rows;
    const found = new Set(locsFound.map(l => l.code));
    const missing = location_codes.filter(c => !found.has(c));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'ValidationError',
        message: `Неизвестные/неактивные локации: ${missing.join(', ')}`
      });
    }

    const redFlagLocs = locsFound.filter(l => l.is_red_flag);
    const redFlagTriggered = redFlagLocs.length > 0;

    const insRes = await client.query(
      `INSERT INTO pain_entries
         (patient_id, program_id, entry_date, is_event,
          vas_score, notes, trigger_type, pain_character, photo_url, red_flag_triggered)
       VALUES ($1, $2, CURRENT_DATE, TRUE, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        patientId, program_id ?? null,
        vas_score, notes ?? null, trigger_type ?? null,
        pain_character ?? null, photo_url ?? null,
        redFlagTriggered
      ]
    );
    const painEntry = insRes.rows[0];

    for (const loc of locsFound) {
      await client.query(
        `INSERT INTO pain_entry_locations (pain_entry_id, location_code) VALUES ($1, $2)`,
        [painEntry.id, loc.code]
      );
    }

    await client.query('COMMIT');

    let opsAlertId = null;
    if (redFlagTriggered) {
      const patRes = await query(
        `SELECT id, full_name, phone, email FROM patients WHERE id = $1`,
        [patientId]
      );
      opsAlertId = await triggerRedFlagAlert({
        patient: patRes.rows[0],
        pain_entry: painEntry,
        locations_data: locsFound,
        red_flag_locs: redFlagLocs,
        is_event: true
      });
      if (opsAlertId) {
        await query(
          `UPDATE pain_entries SET ops_alert_sent_at = NOW() WHERE id = $1`,
          [painEntry.id]
        );
      }
    }

    return res.status(201).json({
      data: {
        ...painEntry,
        locations: locsFound.map(l => ({
          code: l.code, label: l.label, is_red_flag: l.is_red_flag
        })),
        ops_alert_id: opsAlertId
      },
      message: redFlagTriggered
        ? 'Запись о боли сохранена. Куратор получит уведомление о красном флаге.'
        : 'Запись о боли сохранена'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /rehab/my/pain/event error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось сохранить запись' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/rehab/my/pain
 * История. Query: type=daily|event|all (default all), limit, offset, patient_id (instructor)
 */
router.get('/my/pain', authenticatePatientOrInstructor, async (req, res) => {
  try {
    let patientId;
    if (req.patient) {
      patientId = req.patient.id;
    } else {
      patientId = parseInt(req.query.patient_id, 10);
      if (isNaN(patientId)) {
        return res.status(400).json({
          error: 'ValidationError', message: 'patient_id обязателен для инструктора'
        });
      }
    }

    const type = req.query.type || 'all';
    if (!['all', 'daily', 'event'].includes(type)) {
      return res.status(400).json({ error: 'ValidationError', message: 'type: all|daily|event' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    let typeFilter = '';
    if (type === 'daily') typeFilter = 'AND pe.is_event = FALSE';
    if (type === 'event') typeFilter = 'AND pe.is_event = TRUE';

    const { rows } = await query(
      `SELECT
         pe.id, pe.patient_id, pe.program_id, pe.entry_date, pe.is_event,
         pe.vas_score, pe.notes, pe.trigger_type, pe.pain_character, pe.photo_url,
         pe.red_flag_triggered, pe.ops_alert_sent_at,
         pe.created_at, pe.updated_at,
         COALESCE(
           json_agg(
             json_build_object('code', pl.code, 'label', pl.label, 'is_red_flag', pl.is_red_flag)
             ORDER BY pl.position
           ) FILTER (WHERE pl.code IS NOT NULL),
           '[]'::json
         ) AS locations
       FROM pain_entries pe
       LEFT JOIN pain_entry_locations pel ON pel.pain_entry_id = pe.id
       LEFT JOIN pain_locations pl ON pl.code = pel.location_code
       WHERE pe.patient_id = $1 ${typeFilter}
       GROUP BY pe.id
       ORDER BY pe.created_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, limit, offset]
    );

    const totalRes = await query(
      `SELECT COUNT(*)::int AS cnt FROM pain_entries
       WHERE patient_id = $1 ${typeFilter}`,
      [patientId]
    );

    return res.json({ data: rows, total: totalRes.rows[0].cnt });
  } catch (err) {
    console.error('GET /rehab/my/pain error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить историю' });
  }
});
```

### D) `routes/admin.js` — ops-alerts endpoints

```javascript
// === Ops Alerts (Wave 2 коммит 2.04) ===

/**
 * GET /api/admin/ops-alerts
 * Filters: resolved=true|false, alert_type, severity, patient_id, limit, offset.
 * JOIN на pain_entries для триажа.
 */
router.get('/ops-alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { resolved, alert_type, severity, patient_id } = req.query;
    const conditions = [];
    const params = [];

    if (resolved === 'true') conditions.push('oa.resolved_at IS NOT NULL');
    else if (resolved === 'false') conditions.push('oa.resolved_at IS NULL');
    if (alert_type) { params.push(alert_type); conditions.push(`oa.alert_type = $${params.length}`); }
    if (severity)   { params.push(severity);   conditions.push(`oa.severity   = $${params.length}`); }
    if (patient_id) { params.push(parseInt(patient_id, 10)); conditions.push(`oa.patient_id = $${params.length}`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    params.push(limit); params.push(offset);

    const { rows } = await query(
      `SELECT
         oa.id, oa.patient_id, p.full_name AS patient_name, p.phone AS patient_phone,
         oa.alert_type, oa.severity,
         oa.source_entity_type, oa.source_entity_id, oa.details,
         oa.telegram_attempted_at, oa.telegram_dedup_key,
         oa.resolved_at, oa.resolved_by_user_id, oa.resolution_notes,
         oa.created_at,
         pe.vas_score AS pain_vas_score,
         pe.notes AS pain_notes,
         pe.is_event AS pain_is_event,
         pe.entry_date AS pain_entry_date
       FROM ops_alerts oa
       LEFT JOIN patients p ON p.id = oa.patient_id
       LEFT JOIN pain_entries pe
         ON oa.source_entity_type = 'pain_entry' AND pe.id = oa.source_entity_id
       ${whereClause}
       ORDER BY oa.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /admin/ops-alerts error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить алерты' });
  }
});

/**
 * PUT /api/admin/ops-alerts/:id/resolve
 */
router.put('/ops-alerts/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ValidationError', message: 'id должен быть числом' });
  const { resolution_notes } = req.body;

  try {
    const { rows } = await query(
      `UPDATE ops_alerts
       SET resolved_at = NOW(), resolved_by_user_id = $1,
           resolution_notes = $2, updated_at = NOW()
       WHERE id = $3 AND resolved_at IS NULL
       RETURNING *`,
      [req.user.id, resolution_notes ?? null, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Алерт не найден или уже резолвлен' });
    }

    await logAudit(req, 'RESOLVE', 'ops_alert', id, { resolution_notes });

    return res.json({ data: rows[0], message: 'Алерт резолвлен' });
  } catch (err) {
    console.error('PUT /admin/ops-alerts/:id/resolve error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось резолвить' });
  }
});
```

---

## Mock-based тесты

### `backend/tests/__tests__/rehab.pain.test.js` (НОВЫЙ)

```javascript
const request = require('supertest');
const app = require('../../server');
const db = require('../../database/db');

jest.mock('../../database/db');
jest.mock('../../utils/opsAlert');
const { sendOpsAlert } = require('../../utils/opsAlert');

describe('Pain endpoints (Wave 2 коммит 2.04)', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    sendOpsAlert.mockResolvedValue(undefined);

    require('../../middleware/patientAuth').authenticatePatient = jest.fn((req, _res, next) => {
      req.patient = { id: 14 };
      next();
    });
    require('../../middleware/auth').authenticatePatientOrInstructor = jest.fn((req, _res, next) => {
      req.patient = { id: 14 };
      next();
    });

    mockClient = { query: jest.fn(), release: jest.fn() };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
  });

  describe('GET /rehab/my/pain-locations', () => {
    it('возвращает локации program_type пациента', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ program_type: 'acl' }] })
        .mockResolvedValueOnce({ rows: [
          { code: 'knee_anterior', label: 'Передняя', position: 10, is_red_flag: false },
          { code: 'calf_posterior', label: 'Икроножная', position: 80, is_red_flag: true }
        ]});
      const res = await request(app).get('/api/rehab/my/pain-locations');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('пустой массив если patient без active программы', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/rehab/my/pain-locations');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /rehab/my/pain/daily', () => {
    it('400 — vas_score обязателен', async () => {
      const res = await request(app).post('/api/rehab/my/pain/daily').send({ notes: 'X' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vas_score обязателен/);
    });

    it('400 — vas_score вне диапазона', async () => {
      const res = await request(app).post('/api/rehab/my/pain/daily').send({ vas_score: 15 });
      expect(res.status).toBe(400);
    });

    it('INSERT новой daily (нет существующей)', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // FOR UPDATE — нет
        .mockResolvedValueOnce({ rows: [{
          id: 100, patient_id: 14, vas_score: 5, is_event: false,
          entry_date: '2026-05-18', created_at: new Date(), red_flag_triggered: false
        }]})  // INSERT
        .mockResolvedValueOnce(undefined)  // DELETE pain_entry_locations
        .mockResolvedValueOnce(undefined); // COMMIT
      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 5, notes: 'OK день' });
      expect(res.status).toBe(201);
      expect(res.body.data.is_event).toBe(false);
      expect(res.body.data.ops_alert_id).toBeNull();
      expect(sendOpsAlert).not.toHaveBeenCalled();
    });

    it('UPDATE существующей daily (UPSERT повторный submit)', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{
          id: 100, created_at: new Date(), red_flag_triggered: false
        }]})  // FOR UPDATE found
        .mockResolvedValueOnce({ rows: [{
          id: 100, patient_id: 14, vas_score: 7, is_event: false, red_flag_triggered: false
        }]})  // UPDATE
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 7 });
      expect(res.status).toBe(201);
      const updateCall = mockClient.query.mock.calls.find(c => /^\s*UPDATE pain_entries SET vas_score/.test(c[0]));
      expect(updateCall).toBeDefined();
    });

    it('red-flag в daily — sendOpsAlert + INSERT ops_alerts + UPDATE ops_alert_sent_at', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)  // BEGIN
        .mockResolvedValueOnce({ rows: [
          { code: 'calf_posterior', label: 'Икроножная', is_red_flag: true, red_flag_reason: 'ТГВ' }
        ]})  // locations
        .mockResolvedValueOnce({ rows: [] })  // FOR UPDATE
        .mockResolvedValueOnce({ rows: [{
          id: 101, patient_id: 14, vas_score: 8, is_event: false,
          entry_date: '2026-05-18', created_at: new Date(),
          red_flag_triggered: true, notes: 'икра болит'
        }]})
        .mockResolvedValueOnce(undefined)  // DELETE locations
        .mockResolvedValueOnce(undefined)  // INSERT location
        .mockResolvedValueOnce(undefined); // COMMIT

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'Тест', phone: '+7900' }] })
        .mockResolvedValueOnce({ rows: [{ id: 200 }] })  // ops_alerts INSERT
        .mockResolvedValueOnce({ rows: [] });  // UPDATE ops_alert_sent_at

      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 8, location_codes: ['calf_posterior'], notes: 'икра болит' });

      expect(res.status).toBe(201);
      expect(sendOpsAlert).toHaveBeenCalledTimes(1);
      const [title, body] = sendOpsAlert.mock.calls[0];
      expect(title).toMatch(/RED FLAG/);
      expect(body).toMatch(/ТГВ/);
      expect(body).toMatch(/Daily diary/);
      expect(res.body.data.ops_alert_id).toBe(200);
      const setSentAt = db.query.mock.calls.find(c => /ops_alert_sent_at = NOW/.test(c[0]));
      expect(setSentAt).toBeDefined();
    });

    it('sticky red_flag — UPDATE сохраняет prev=true даже если новый без red-flag', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [
          { code: 'knee_anterior', is_red_flag: false, red_flag_reason: null }
        ]})
        .mockResolvedValueOnce({ rows: [{
          id: 100, created_at: new Date(), red_flag_triggered: true  // prev red flag
        }]})
        .mockResolvedValueOnce({ rows: [{ id: 100, red_flag_triggered: true }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 3, location_codes: ['knee_anterior'] });
      expect(res.status).toBe(201);
      const updateCall = mockClient.query.mock.calls.find(c => /^\s*UPDATE pain_entries SET vas_score/.test(c[0]));
      // 5th param — red_flag_triggered, должен быть true (sticky)
      expect(updateCall[1][4]).toBe(true);
    });

    it('400 — неизвестная локация', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ code: 'knee_anterior' }] });
      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 5, location_codes: ['knee_anterior', 'fake_loc'] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/fake_loc/);
    });

    it('notes слишком длинный — 400', async () => {
      const res = await request(app)
        .post('/api/rehab/my/pain/daily')
        .send({ vas_score: 5, notes: 'x'.repeat(1001) });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /rehab/my/pain/event', () => {
    it('400 — location_codes обязательны', async () => {
      const res = await request(app).post('/api/rehab/my/pain/event').send({ vas_score: 5 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/location_codes/);
    });

    it('400 — пустой location_codes', async () => {
      const res = await request(app)
        .post('/api/rehab/my/pain/event')
        .send({ vas_score: 5, location_codes: [] });
      expect(res.status).toBe(400);
    });

    it('event без red-flag — INSERT с is_event=true, без sendOpsAlert', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', label: 'X', is_red_flag: false }] })
        .mockResolvedValueOnce({ rows: [{
          id: 200, patient_id: 14, vas_score: 6, is_event: true,
          red_flag_triggered: false, created_at: new Date()
        }]})
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/rehab/my/pain/event')
        .send({ vas_score: 6, location_codes: ['knee_anterior'], trigger_type: 'после тренировки' });
      expect(res.status).toBe(201);
      expect(res.body.data.is_event).toBe(true);
      expect(sendOpsAlert).not.toHaveBeenCalled();
    });

    it('event с red-flag → Pain Event mode в Telegram body', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{
          code: 'neck_lateral', label: 'Шея', is_red_flag: true, red_flag_reason: 'радикулопатия'
        }]})
        .mockResolvedValueOnce({ rows: [{
          id: 201, patient_id: 14, vas_score: 9, is_event: true,
          created_at: new Date(), trigger_type: 'резкий поворот'
        }]})
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'X', phone: '+7900' }] })
        .mockResolvedValueOnce({ rows: [{ id: 300 }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post('/api/rehab/my/pain/event')
        .send({ vas_score: 9, location_codes: ['neck_lateral'], trigger_type: 'резкий поворот' });
      expect(res.status).toBe(201);
      expect(sendOpsAlert).toHaveBeenCalled();
      const [, body] = sendOpsAlert.mock.calls[0];
      expect(body).toMatch(/Pain Event/);
      expect(body).toMatch(/радикулопатия/);
      expect(body).toMatch(/резкий поворот/);
    });

    it('event с photo_url сохраняется', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', is_red_flag: false }] })
        .mockResolvedValueOnce({ rows: [{
          id: 202, vas_score: 5, is_event: true, photo_url: '/uploads/pain_202.jpg'
        }]})
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      const res = await request(app)
        .post('/api/rehab/my/pain/event')
        .send({ vas_score: 5, location_codes: ['knee_anterior'], photo_url: '/uploads/pain_202.jpg' });
      expect(res.status).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(c => /^\s*INSERT INTO pain_entries/.test(c[0]));
      expect(insertCall[1]).toContain('/uploads/pain_202.jpg');
    });
  });

  describe('GET /rehab/my/pain', () => {
    it('пациент свою историю — type=all default', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [
          { id: 1, vas_score: 5, is_event: false, locations: [] },
          { id: 2, vas_score: 8, is_event: true, locations: [] }
        ]})
        .mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
      const res = await request(app).get('/api/rehab/my/pain');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('type=daily — фильтрует is_event=FALSE', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, is_event: false }] })
        .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
      const res = await request(app).get('/api/rehab/my/pain?type=daily');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toMatch(/is_event = FALSE/);
    });

    it('type=event — фильтрует is_event=TRUE', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, is_event: true }] })
        .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
      const res = await request(app).get('/api/rehab/my/pain?type=event');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toMatch(/is_event = TRUE/);
    });

    it('type невалидный — 400', async () => {
      const res = await request(app).get('/api/rehab/my/pain?type=wrong');
      expect(res.status).toBe(400);
    });

    it('инструктор требует patient_id', async () => {
      require('../../middleware/auth').authenticatePatientOrInstructor = jest.fn((req, _res, next) => {
        req.user = { id: 1, role: 'instructor' };
        next();
      });
      const res = await request(app).get('/api/rehab/my/pain');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/patient_id обязателен/);
    });
  });
});
```

### `backend/tests/__tests__/admin.routes.test.js` (extend)

```javascript
describe('Admin ops-alerts (Wave 2 коммит 2.04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../../middleware/auth').authenticateToken = jest.fn((req, _res, next) => {
      req.user = { id: 1, role: 'admin', is_active: true };
      next();
    });
    require('../../middleware/auth').requireAdmin = jest.fn((req, _res, next) => next());
  });

  it('GET /admin/ops-alerts JOIN на pain_entries', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: 1, patient_id: 14, patient_name: 'Тест', alert_type: 'red_flag_pain',
      severity: 'high', resolved_at: null,
      pain_vas_score: 8, pain_notes: 'икра', pain_is_event: false
    }]});
    const res = await request(app).get('/api/admin/ops-alerts');
    expect(res.status).toBe(200);
    expect(res.body.data[0].pain_vas_score).toBe(8);
    expect(db.query.mock.calls[0][0]).toMatch(/LEFT JOIN pain_entries pe[\s\S]+source_entity_id/);
  });

  it('GET ?resolved=false', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/admin/ops-alerts?resolved=false');
    expect(db.query.mock.calls[0][0]).toMatch(/oa\.resolved_at IS NULL/);
  });

  it('GET ?patient_id=14', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/admin/ops-alerts?patient_id=14');
    expect(db.query.mock.calls[0][1]).toContain(14);
  });

  it('PUT /:id/resolve + audit UPPERCASE', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, resolved_at: new Date() }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/admin/ops-alerts/1/resolve').send({ resolution_notes: 'связался' });
    expect(res.status).toBe(200);
    const auditCall = db.query.mock.calls.find(c => /INSERT INTO audit_logs/.test(c[0]));
    expect(auditCall).toBeDefined();
    expect(auditCall[1]).toContain('RESOLVE');
  });

  it('PUT 404 если уже resolved', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/admin/ops-alerts/1/resolve').send({});
    expect(res.status).toBe(404);
  });

  it('PUT 400 — non-numeric id', async () => {
    const res = await request(app).put('/api/admin/ops-alerts/abc/resolve').send({});
    expect(res.status).toBe(400);
  });
});
```

---

## NOT TOUCH

- `utils/opsAlert.js` — переиспользуем
- `services/telegramBot.js`
- Frontend (2.05)
- LOCKED-зоны
- `pain_locations` / `pain_entries` schema — только seed/data

---

## Smoke test (4-card format)

### Сценарий 1 — Миграция

```
Шаг 1.1 — Применить
├─ Где: терминал
├─ Что найти: backend/database/migrations/20260519_ops_alerts.sql
├─ Что сделать: psql -U postgres -d azarean_rehab -f <файл>
└─ Что увидеть: BEGIN / CREATE / COMMIT без ошибок

Шаг 1.2 — Структура
├─ Где: psql
├─ Что найти: \d ops_alerts
├─ Что сделать: запустить
└─ Что увидеть: 14 колонок (SLIM, без telegram_message_id и т.п.), 3 индекса
```

### Сценарий 2 — Daily endpoint без red-flag

```
Шаг 2.1 — Login патиента
├─ Где: терминал
├─ Что найти: backend на :5000, test patient #14
├─ Что сделать: curl POST /api/auth/patient/login → cookie /tmp/c.txt
└─ Что увидеть: TOKEN получен, cookie сохранена

Шаг 2.2 — POST daily первый раз
├─ Где: терминал
├─ Что найти: endpoint /api/rehab/my/pain/daily
├─ Что сделать: curl с vas_score=4, location_codes=['knee_anterior']
└─ Что увидеть: 201, data.id новый, is_event=false, ops_alert_id=null

Шаг 2.3 — POST daily повторный (UPSERT)
├─ Где: терминал
├─ Что найти: тот же endpoint
├─ Что сделать: curl с vas_score=6, notes="изменилось"
└─ Что увидеть: 201, data.id ТОТ ЖЕ, vas_score обновлён, created_at прежний

Шаг 2.4 — psql verify
├─ Где: psql
├─ Что найти: pain_entries patient_id=14 entry_date=CURRENT_DATE
├─ Что сделать: SELECT id, vas_score, is_event, red_flag_triggered FROM ...
└─ Что увидеть: 1 строка с vas_score=6, is_event=false, red_flag=false
```

### Сценарий 3 — **ГЛАВНЫЙ** — Event с red-flag + живой Telegram

```
Шаг 3.1 — Проверить OPS_CHAT_ID
├─ Где: backend/.env
├─ Что найти: OPS_CHAT_ID=
├─ Что сделать: убедиться что значение = твой реальный chat_id
└─ Что увидеть: непустое числовое значение (183943760 или твой)

Шаг 3.2 — POST event с red-flag
├─ Где: терминал, сессия пациента из 2.1
├─ Что найти: endpoint /api/rehab/my/pain/event
├─ Что сделать: curl с vas_score=8, location_codes=['calf_posterior'],
│              trigger_type="после длинной прогулки", notes="икра болит, отёк"
└─ Что увидеть: 201, is_event=true, red_flag_triggered=true,
                ops_alert_id число, message «Куратор получит уведомление»

Шаг 3.3 — Telegram доставка
├─ Где: Telegram app, чат с OPS bot'ом
├─ Что найти: новое входящее
├─ Что сделать: открыть
└─ Что увидеть:
   🚨 RED FLAG: <твоё имя> (ID 14)
   Режим: Pain Event
   VAS: 8/10
   Локации с красным флагом:
   • Икроножная мышца ... — Возможный тромбоз глубоких вен ...
   Триггер: после длинной прогулки
   Заметка: икра болит, отёк
   Pain entry ID: <N> (2026-05-18 HH:MM)

Шаг 3.4 — БД verification
├─ Где: psql
├─ Что найти: ops_alerts последняя + pain_entries.ops_alert_sent_at
├─ Что сделать: SELECT'ы
└─ Что увидеть: ops_alert с source_entity_type='pain_entry', source_entity_id
                равно pain_entries.id; telegram_attempted_at заполнен;
                pain_entries.ops_alert_sent_at заполнен
```

### Сценарий 4 — Dedup проверка

```
Шаг 4.1 — Второй red-flag в течение часа
├─ Где: терминал
├─ Что найти: тот же curl для /pain/event
├─ Что сделать: повторить POST с теми же location_codes calf_posterior
└─ Что увидеть: 201 опять (новый pain_entry создан),
                но Telegram — НЕ повторно (dedup в utils/opsAlert.js)

Шаг 4.2 — БД verify
├─ Где: psql
├─ Что найти: pain_entries последние 2 с calf_posterior
├─ Что сделать: SELECT id, created_at, ops_alert_sent_at
└─ Что увидеть: оба pain_entry с ops_alert_sent_at заполненным
                (оба attempted), но Telegram пришёл один
```

### Сценарий 5 — Admin triage

```
Шаг 5.1 — Login admin
├─ Где: терминал
├─ Что найти: vadim@azarean.com / Test1234
├─ Что сделать: curl login → AdminTOKEN
└─ Что увидеть: AdminTOKEN получен

Шаг 5.2 — GET unresolved с JOIN
├─ Где: терминал
├─ Что найти: /api/admin/ops-alerts?resolved=false
├─ Что сделать: curl
└─ Что увидеть: data[] записи имеют pain_vas_score, pain_notes,
                pain_is_event (JOIN отработал)

Шаг 5.3 — Резолв
├─ Где: терминал
├─ Что найти: ID unresolved алерта
├─ Что сделать: curl PUT с resolution_notes
└─ Что увидеть: 200, resolved_at заполнен, audit_logs RESOLVE
```

### Сценарий 6 — GET history filter

```
Шаг 6.1 — type=all default
├─ Что сделать: curl GET /api/rehab/my/pain
└─ Что увидеть: daily + event записи, is_event поле в каждой

Шаг 6.2 — type=daily
├─ Что сделать: curl ?type=daily
└─ Что увидеть: только is_event=false

Шаг 6.3 — type=event
├─ Что сделать: curl ?type=event
└─ Что увидеть: только is_event=true
```

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260519_ops_alerts.sql` (SLIM)
- `backend/tests/__tests__/rehab.pain.test.js` (~24)

### Изменить
- `backend/routes/rehab.js` (+~320 строк)
- `backend/routes/admin.js` (+~80)
- `backend/tests/__tests__/admin.routes.test.js` (+~6)
- `CLAUDE.md`

### НЕ СОЗДАВАТЬ
- ❌ `backend/services/opsAlerts.js`
- ❌ env `OPS_ALERT_CHAT_ID`

### НЕ ТРОГАТЬ
- `utils/opsAlert.js`
- `services/telegramBot.js`
- Frontend
- LOCKED-зоны

---

## Текст коммита

```
feat(rehab): Wave 2 — pain endpoints (daily + event) + red-flag automation

Wave 2 коммит 2.04 — Block B Pain Tracking. Backend для structured pain
с двумя modes (daily UPSERT + event INSERT) и red-flag automation через
существующий utils/opsAlert.js.

Backend:
- Migration 20260519_ops_alerts.sql — slim table для admin triage
  (без telegram_* колонок — handles utils/opsAlert.js).
- routes/rehab.js:
  GET /my/pain-locations
  POST /my/pain/daily — UPSERT через SELECT FOR UPDATE → UPDATE/INSERT,
    UNIQUE (patient_id, entry_date) WHERE is_event=false. red_flag sticky.
  POST /my/pain/event — INSERT, is_event=true. Требует location_codes ≥ 1.
  GET /my/pain — filter ?type=daily|event|all, json_agg locations.
  Inline triggerRedFlagAlert использует sendOpsAlert + INSERT ops_alerts
  с source_entity_id=pain_entry.id.
- routes/admin.js:
  GET /admin/ops-alerts — JOIN на pain_entries (admin видит VAS+notes сразу).
  PUT /admin/ops-alerts/:id/resolve — logAudit UPPERCASE 'RESOLVE'.

Red-flag flow:
- pain_entry создан → check is_red_flag locations
- Если ≥1 → triggerRedFlagAlert():
  1. await sendOpsAlert(title, body) — fire-and-forget, dedup+hourly cap
     в utils/opsAlert.js
  2. INSERT ops_alerts с source_entity_id=pain_entry.id
  3. UPDATE pain_entries SET ops_alert_sent_at = NOW()

Переиспользует:
- utils/opsAlert.js (Wave 1 fix #50) — НЕ дублируется
- OPS_CHAT_ID + OPS_BOT_TOKEN — existing env
- middleware/patientAuth.js (req.patient.id)
- logAudit UPPERCASE

Tests:
- rehab.pain.test.js (НОВЫЙ) +24
- admin.routes.test.js (extend) +6

Не трогает frontend (2.05).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- «Запуск проекта → PostgreSQL» — миграция 20260519
- «API endpoints → Rehab» — 4 строки
- «API endpoints → Admin» — 2 строки
- «Завершённые исправления» — запись с reuse opsAlert.js

**Memory:**
- `wave_2_progress.md` — 2.04 ⏸, SHA, метрики
- Создать `memory/architect_premise_drift_2026-05-18.md` — incident report (Vadim'a уточнение). Pattern: «архитектор не сверил TZ с реальной schema 2.01 + не прочитал CLAUDE.md fix #50». Меры: TZ verify-step должен включать `psql \d <table>` + `grep` в CLAUDE.md «Завершённые исправления» по теме.

---

## Definition of Done

- [ ] Verify-step выполнен: schema подтверждена, `sendOpsAlert(title, body)` сигнатур точный, `req.patient.id` pattern, patient→program_type lookup определён
- [ ] Миграция применена, ops_alerts SLIM без telegram_* колонок, 3 индекса
- [ ] **НЕТ** `backend/services/opsAlerts.js`
- [ ] **НЕТ** env `OPS_ALERT_CHAT_ID`
- [ ] POST /my/pain/daily UPSERT (первый — INSERT, повторный — UPDATE, id сохраняется)
- [ ] Sticky red_flag_triggered работает
- [ ] POST /my/pain/event — INSERT всегда, многократно за день OK
- [ ] Red-flag → sendOpsAlert + ops_alerts INSERT + UPDATE ops_alert_sent_at
- [ ] **Dedup проверка прошла** — второй red-flag за час pain_entry создан, Telegram не повторно
- [ ] GET /my/pain ?type=all|daily|event фильтрует
- [ ] GET /admin/ops-alerts JOIN'ит pain_entries (pain_vas_score, pain_notes видны)
- [ ] PUT /admin/ops-alerts/:id/resolve → 200 + audit UPPERCASE 'RESOLVE'
- [ ] **Smoke сценарий 3 проигран на dev с реальным Telegram** — Vadim получил 🚨 RED FLAG, прислал текст/скриншот архитектору
- [ ] Все 24+6=30 новых тестов зелёные
- [ ] Existing не сломаны (backend после 2.01-2.04: ~521)
- [ ] CLAUDE.md обновлён
- [ ] memory/architect_premise_drift_2026-05-18.md создан
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] `wave_2_progress.md` — 2.04 ⏸
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR от ветки `wave-2/04-pain-backend`, висит до batch merge

---

## После 2.04

**Block B наполовину.** Stack:
```
af313b4 → a6f7980 → 82544c0 → 98ca5f2 → e6f11a9 → <2.04 sha>
[2.01]    [2.02]    [2.03]    [HF7]      [HF8]      [2.04]
```

**2.05** Frontend DiaryScreen + Pain Event SOS — TZ пишу после твоего отчёта по 2.04. Особенно важен:
- Скриншот/текст живого Telegram alert'а
- UX feedback от использования PainLocationsTab в 2.02

**Backlog от 2.04:**
- Возможно рост ops_alerts без resolve → admin UI для bulk-resolve. Решим если поток алертов на пилоте окажется большой.
- `pain_character` (sharp/dull/burning/throbbing) — в 2.05 UI hardcode list. Альтернатива — справочная таблица. Pилотим хардкодом, миграция в Wave 3 если надо.
