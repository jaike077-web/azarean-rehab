# TZ Wave 2 · Коммит 2.04 — Backend pain endpoints + red flag automation + ops-alert

**Дата:** 2026-05-16, обновлено 2026-05-18
**Версия:** v2 (после отчёта по 2.02 — учитывает premise drift #2 audit verbs UPPERCASE; v3 при необходимости после 2.03/2.04 реализации)
**Roadmap:** PATIENT_UX_ROADMAP_2026-05-08_v2.md Волна 2 Block B (Pain tracking)
**Цель:** Открыть Block B. Реализовать backend для structured pain tracking: pain_entries CRUD для пациента, multi-select по локациям, public endpoint для frontend, **red flag automation** (Telegram DM + ops_alerts таблица), admin endpoints для триажа. После этого коммита patient frontend 2.05 имеет готовый API; красные флаги (ТГВ, радикулопатия) триггерят инцидент-канал.
**Объём:** 6-8 часов
**Риск:** средний — новая `ops_alerts` таблица, интеграция с Telegram (mock в тестах), композитное patient/instructor auth. Не трогает frontend (это 2.05).

**Применённые премис-дрейф фиксы:**
- ✅ logAudit helper из admin.js:17
- ✅ **Audit action verbs UPPERCASE** (`'RESOLVE'`, etc) — фактический паттерн admin.js (подтверждено отчётом по 2.02)
- ✅ Telegraf НЕ используем (правило: Azarean Rehab — только `node-telegram-bot-api` 0.67)
- ✅ raw SQL через query()/getClient(), не pool
- ✅ API response format `{data, message?, total?}`, NO `success: true/false`

---

## Verify-step перед стартом

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) 2.01-2.03 в наличии: 7 таблиц + pain_locations seed
psql -U postgres -d azarean_rehab -c "SELECT COUNT(*) FROM pain_locations;"
# Ожидание: 16 (после 2.02). Если 0 — 2.02 не применён, остановись.

psql -U postgres -d azarean_rehab -c "\d pain_entries"
psql -U postgres -d azarean_rehab -c "\d pain_entry_locations"
# Ожидание: таблицы существуют с колонками из 2.01 schema

# 2) КРИТИЧНО: точная структура pain_entries — patient_id, vas_score, free_text, created_at
psql -U postgres -d azarean_rehab -c "\d pain_entries"
# Сверь с использованием в коде ниже. Если колонки иные (например vas_score → severity)
# СТОП, скажи архитектору, поправлю TZ.

# 3) Patient auth pattern — как определить patient_id из req.user
grep -n "authenticatePatient\|patient_id\|req\.user\.patient_id" backend/middleware/auth.js
grep -n "authenticatePatientOrInstructor" backend/middleware/auth.js
# Ожидание: middleware патернов есть. Нужно определить как извлечь patient_id:
# либо req.user.patient_id (если в JWT payload), либо отдельный lookup users → patients

# 4) Telegram bot — существующий instance
grep -n "node-telegram-bot-api\|new TelegramBot\|bot\.sendMessage" backend/ -r | head -10
# Ожидание: найти где создаётся bot instance. Скорее всего в backend/bot/ или server.js
# Bot уже используется для diary reminders (по memory)

# 5) Vadim's Telegram chat_id — где хранится
grep -rn "VADIM_TELEGRAM_CHAT_ID\|OPS_ALERT_CHAT_ID\|telegram_chat_id" backend/
cat backend/.env 2>/dev/null | grep -i telegram
# Ожидание: либо переменная в .env, либо колонка users.telegram_chat_id для роли admin

# 6) Существующие routes/rehab.js endpoints
grep -n "router\.\(get\|post\|put\|delete\)" backend/routes/rehab.js | head -20
wc -l backend/routes/rehab.js
# Ожидание: видны существующие /phases /tips и паттерн авторизации

# 7) audit_logs — entity_type 'pain_entry' пока не использовался
psql -U postgres -d azarean_rehab -c "SELECT DISTINCT entity_type FROM audit_logs LIMIT 20;"
# Ожидание: 'pain_entry' нет — мы первые добавляем

# 8) ops_alerts ещё не существует
psql -U postgres -d azarean_rehab -c "\dt ops_alerts"
# Ожидание: relation does not exist. Мы создаём в этом коммите.

# 9) Подтвердить что pain endpoints ещё не существуют
grep -rn "/api/rehab/pain\|/api/admin/ops-alerts" backend/routes/ 2>/dev/null
# Ожидание: 0 совпадений
```

**Если grep покажет:**
- Bot instance в `backend/bot/` инжектируется глобально (singleton) — используем тот же. Если не подгружается на старте — нужно требовать в обработчике.
- Vadim's chat_id отсутствует — добавляем переменную `OPS_ALERT_CHAT_ID` в `.env` (Claude Code не пишет реальное значение в коммит, только placeholder и .env.example)
- `req.user.patient_id` НЕ доступен из JWT — добавляем SQL-lookup users JOIN patients

---

## Зависимости

- 2.01 (schema): `pain_entries`, `pain_entry_locations`, `pain_locations` таблицы
- 2.02 (data): 16 pain_locations с red-flag разметкой
- 2.03 (optional): для тестов не критично, но проще если есть criteria для контекста

**Ветка:** `wave-2/04-pain-backend` от `wave-2/03-criteria-admin-seed` (rebase chain).

---

## Что блокирует

- **2.05** (Frontend DiaryScreen + Pain Event SOS) — нужны API endpoints из 2.04
- **2.13** (Frontend Roadmap UI) — Stuck banner v2 интегрируется с ops_alerts (косвенно)
- Pilot launch — без ops-alert у Vadim нет автоматического notification на красный флаг

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `backend/database/migrations/20260519_ops_alerts.sql` | НОВЫЙ — таблица ops_alerts + 3 индекса |
| `backend/routes/rehab.js` | EXTEND — добавить 3 endpoints (~250 строк) |
| `backend/routes/admin.js` | EXTEND — добавить 2 endpoints для ops-alerts triage (~80 строк) |
| `backend/services/opsAlerts.js` | НОВЫЙ — helper для создания alert + Telegram отправки (~80 строк) |
| `backend/.env.example` | UPDATE — добавить `OPS_ALERT_CHAT_ID` placeholder |
| `backend/tests/__tests__/rehab.pain.test.js` | НОВЫЙ — тесты pain endpoints (~20 тестов) |
| `backend/tests/__tests__/opsAlerts.test.js` | НОВЫЙ — тесты red flag automation (~10 тестов, mock telegram) |
| `backend/tests/__tests__/admin.routes.test.js` | EXTEND — describe('ops-alerts') (~6 тестов) |
| `CLAUDE.md` | UPDATE — миграция + endpoints + env var |

**НЕ ТРОГАТЬ:**

- Frontend (это 2.05)
- `pain_locations` schema/данные (это 2.01/2.02)
- LOCKED-зоны (ExerciseRunner, OAuth, PatientDashboard pd-*)
- Telegram diary reminder logic — оставить как есть, не объединять с ops-alert
- JARVIS Director (другая кодовая база)

---

## Конкретная реализация

### A) Migration: `backend/database/migrations/20260519_ops_alerts.sql`

```sql
-- Wave 2 коммит 2.04 — ops_alerts table
-- Назначение: инцидент-журнал для admin/куратор. Источник: red-flag pain entries,
-- в будущем — overdue diary, criterion stuck, и т.д.
-- Записи создаются автоматически из бизнес-логики (services/opsAlerts.js).
-- Резолвится admin'ом через PUT /api/admin/ops-alerts/:id/resolve.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_alerts (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  alert_type      VARCHAR(50) NOT NULL,  -- 'red_flag_pain', future: 'overdue_diary', 'criterion_stuck'
  severity        VARCHAR(20) NOT NULL DEFAULT 'high',  -- 'low','medium','high','critical'
  source_entity_type VARCHAR(50),   -- 'pain_entry', null если manual
  source_entity_id   INTEGER,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Telegram tracking
  telegram_message_id   TEXT,
  telegram_chat_id      TEXT,
  telegram_sent_at      TIMESTAMP,
  telegram_send_error   TEXT,     -- если send_message упал — записываем причину
  -- Resolution
  resolved_at         TIMESTAMP,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes    TEXT,
  -- Audit
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_resolved_pair CHECK (
    (resolved_at IS NULL AND resolved_by_user_id IS NULL) OR
    (resolved_at IS NOT NULL)
  )
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_ops_alerts_unresolved
  ON ops_alerts (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_patient
  ON ops_alerts (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_type
  ON ops_alerts (alert_type, severity, created_at DESC);

-- Триггер updated_at (если в проекте есть общий, можно опустить)
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

### B) `.env.example` обновление

Добавить:

```bash
# Wave 2 ops-alert Telegram channel (DM Vadim'у при red-flag pain)
OPS_ALERT_CHAT_ID=                # Vadim's personal Telegram chat_id (e.g., '123456789')
```

В production `.env` Vadim заполнит реальным chat_id. Если переменная пустая на старте — backend логирует warning, но не падает (см. opsAlerts.js логику).

### C) `backend/services/opsAlerts.js` (НОВЫЙ)

```javascript
/**
 * Wave 2 коммит 2.04 — Ops Alerts service
 * Создаёт запись в ops_alerts + отправляет Telegram DM Vadim'у.
 * Используется из routes/rehab.js при создании red-flag pain_entry.
 */
const { query } = require('../database/db');

/**
 * Получить bot instance.
 * Импорт ленивый (avoid circular dep с server.js где bot создаётся).
 */
function getBot() {
  try {
    // Путь зависит от структуры — Claude Code сверяет в verify-step
    return require('../bot/instance').bot;  // ← или другой путь
  } catch (e) {
    return null;
  }
}

/**
 * Создаёт ops_alert + (попыточно) отправляет Telegram уведомление.
 * Не бросает исключений наружу — failure в Telegram не должен падать pain_entry creation.
 *
 * @param {object} params
 * @param {number} params.patient_id
 * @param {string} params.alert_type — 'red_flag_pain'
 * @param {string} params.severity — 'high' | 'critical'
 * @param {string} params.source_entity_type — 'pain_entry'
 * @param {number} params.source_entity_id
 * @param {object} params.details — JSONB: { locations: [...], vas_score, free_text, ... }
 * @param {string} params.telegram_message — текст для Telegram (форматированный)
 * @returns {Promise<{ops_alert_id: number, telegram_sent: boolean}>}
 */
async function createOpsAlert({
  patient_id, alert_type, severity, source_entity_type, source_entity_id, details, telegram_message
}) {
  // 1. Создаём запись в БД
  const { rows } = await query(
    `INSERT INTO ops_alerts (patient_id, alert_type, severity, source_entity_type, source_entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [patient_id, alert_type, severity, source_entity_type, source_entity_id, JSON.stringify(details)]
  );
  const ops_alert_id = rows[0].id;

  // 2. Пытаемся отправить Telegram
  const chatId = process.env.OPS_ALERT_CHAT_ID;
  if (!chatId) {
    console.warn(`[opsAlerts] OPS_ALERT_CHAT_ID не задан в env — ops_alert ${ops_alert_id} создан без Telegram уведомления`);
    return { ops_alert_id, telegram_sent: false };
  }

  const bot = getBot();
  if (!bot) {
    console.warn(`[opsAlerts] Telegram bot instance не доступен — ops_alert ${ops_alert_id} без Telegram`);
    await query(
      `UPDATE ops_alerts SET telegram_send_error = $1 WHERE id = $2`,
      ['bot instance unavailable', ops_alert_id]
    );
    return { ops_alert_id, telegram_sent: false };
  }

  try {
    const tgRes = await bot.sendMessage(chatId, telegram_message, { parse_mode: 'HTML' });
    await query(
      `UPDATE ops_alerts SET telegram_message_id = $1, telegram_chat_id = $2, telegram_sent_at = NOW() WHERE id = $3`,
      [String(tgRes.message_id), String(chatId), ops_alert_id]
    );
    return { ops_alert_id, telegram_sent: true };
  } catch (err) {
    console.error(`[opsAlerts] Telegram send failed for alert ${ops_alert_id}:`, err.message);
    await query(
      `UPDATE ops_alerts SET telegram_send_error = $1 WHERE id = $2`,
      [err.message.slice(0, 500), ops_alert_id]
    );
    return { ops_alert_id, telegram_sent: false };
  }
}

/**
 * Формирует Telegram текст для red-flag pain alert (HTML mode).
 */
function formatRedFlagPainMessage({ patient, pain_entry, locations_data }) {
  const redFlagLines = locations_data
    .filter(l => l.is_red_flag)
    .map(l => `• <b>${escapeHtml(l.label)}</b>\n  ${escapeHtml(l.red_flag_reason || 'причина не указана')}`)
    .join('\n');

  const vasLine = pain_entry.vas_score != null
    ? `\n📊 ВАШ: <b>${pain_entry.vas_score}/10</b>`
    : '';
  const noteLine = pain_entry.free_text
    ? `\n💬 Заметка: <i>${escapeHtml(pain_entry.free_text)}</i>`
    : '';

  return (
    `🚨 <b>КРАСНЫЙ ФЛАГ — БОЛЬ</b>\n\n` +
    `👤 Пациент: <b>${escapeHtml(patient.full_name || 'без имени')}</b> (ID ${patient.id})\n` +
    `📞 ${escapeHtml(patient.phone || '—')}\n` +
    vasLine + noteLine + `\n\n` +
    `Локации с красным флагом:\n${redFlagLines}\n\n` +
    `Действие: срочно связаться с пациентом, оценить состояние.\n` +
    `Pain entry ID: ${pain_entry.id} | ${new Date(pain_entry.created_at).toLocaleString('ru-RU')}`
  );
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { createOpsAlert, formatRedFlagPainMessage };
```

### D) `backend/routes/rehab.js` — расширение с pain endpoints

```javascript
const { createOpsAlert, formatRedFlagPainMessage } = require('../services/opsAlerts');

/**
 * GET /api/rehab/pain-locations
 * Public endpoint для аутентифицированного пациента — список active локаций для program_type пациента.
 */
router.get('/pain-locations', authenticatePatient, async (req, res) => {
  try {
    // Извлечь program_type пациента
    const patientId = req.user.patient_id;
    const ptRes = await query(
      `SELECT program_type FROM patients WHERE id = $1`,
      [patientId]
    );
    if (ptRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Пациент не найден' });
    }
    const programType = ptRes.rows[0].program_type;
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
    console.error('GET /rehab/pain-locations error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить локации' });
  }
});

/**
 * POST /api/rehab/pain
 * Создать pain_entry с локациями. Body:
 * { vas_score, free_text?, location_codes: ['knee_anterior', ...] }
 * При наличии red-flag локации — триггер ops_alert + Telegram.
 */
router.post('/pain', authenticatePatient, async (req, res) => {
  const { vas_score, free_text, location_codes } = req.body;

  // Валидация
  if (vas_score !== undefined && vas_score !== null) {
    if (typeof vas_score !== 'number' || vas_score < 0 || vas_score > 10) {
      return res.status(400).json({ error: 'ValidationError', message: 'vas_score: число 0..10' });
    }
  }
  if (free_text && (typeof free_text !== 'string' || free_text.length > 1000)) {
    return res.status(400).json({ error: 'ValidationError', message: 'free_text ≤ 1000 символов' });
  }
  if (!Array.isArray(location_codes) || location_codes.length === 0) {
    return res.status(400).json({ error: 'ValidationError', message: 'location_codes: непустой массив' });
  }
  if (location_codes.length > 16) {
    return res.status(400).json({ error: 'ValidationError', message: 'не больше 16 локаций за раз' });
  }

  const patientId = req.user.patient_id;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Подтянуть локации с red-flag разметкой за один запрос
    const locsRes = await client.query(
      `SELECT code, label, is_red_flag, red_flag_reason
       FROM pain_locations
       WHERE code = ANY($1) AND is_active = TRUE`,
      [location_codes]
    );
    const locsFound = locsRes.rows;
    const foundCodes = new Set(locsFound.map(l => l.code));
    const missing = location_codes.filter(c => !foundCodes.has(c));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'ValidationError',
        message: `Неизвестные/неактивные локации: ${missing.join(', ')}`
      });
    }

    // Создать pain_entry
    const peRes = await client.query(
      `INSERT INTO pain_entries (patient_id, vas_score, free_text)
       VALUES ($1, $2, $3) RETURNING *`,
      [patientId, vas_score ?? null, free_text ?? null]
    );
    const painEntry = peRes.rows[0];

    // Прицепить локации
    for (const loc of locsFound) {
      await client.query(
        `INSERT INTO pain_entry_locations (pain_entry_id, location_code) VALUES ($1, $2)`,
        [painEntry.id, loc.code]
      );
    }

    await client.query('COMMIT');

    // Red-flag automation — вне транзакции, failure тут не должен откатывать pain_entry
    const redFlagLocs = locsFound.filter(l => l.is_red_flag);
    let opsAlertInfo = null;
    if (redFlagLocs.length > 0) {
      try {
        // Подтянуть инфо пациента для уведомления
        const patRes = await query(
          `SELECT id, full_name, phone, email FROM patients WHERE id = $1`,
          [patientId]
        );
        const patient = patRes.rows[0];

        const tgMessage = formatRedFlagPainMessage({
          patient,
          pain_entry: painEntry,
          locations_data: locsFound
        });

        opsAlertInfo = await createOpsAlert({
          patient_id: patientId,
          alert_type: 'red_flag_pain',
          severity: 'high',
          source_entity_type: 'pain_entry',
          source_entity_id: painEntry.id,
          details: {
            vas_score,
            free_text,
            location_codes,
            red_flag_locations: redFlagLocs.map(l => ({ code: l.code, label: l.label, reason: l.red_flag_reason }))
          },
          telegram_message: tgMessage
        });
      } catch (alertErr) {
        // Логируем но не падаем — pain_entry уже создан, alert failure это incident'ный момент
        console.error('[POST /rehab/pain] ops_alert creation failed:', alertErr);
      }
    }

    return res.status(201).json({
      data: {
        ...painEntry,
        locations: locsFound.map(l => ({ code: l.code, label: l.label, is_red_flag: l.is_red_flag })),
        ops_alert: opsAlertInfo  // null если не было red-flag, иначе { ops_alert_id, telegram_sent }
      },
      message: redFlagLocs.length > 0
        ? 'Запись о боли сохранена. Куратор получит уведомление о красном флаге.'
        : 'Запись о боли сохранена'
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /rehab/pain error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось сохранить запись' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/rehab/pain
 * История pain_entries аутентифицированного пациента. Query: limit (default 30), offset.
 * Доступно: пациент свою историю, инструктор — через ?patient_id для конкретного пациента.
 */
router.get('/pain', authenticatePatientOrInstructor, async (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'patient' || req.user.role === 'patient_user') {
      patientId = req.user.patient_id;
    } else {
      // Инструктор/админ должны передать patient_id
      patientId = parseInt(req.query.patient_id, 10);
      if (isNaN(patientId)) {
        return res.status(400).json({ error: 'ValidationError', message: 'patient_id обязателен для инструктора' });
      }
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { rows } = await query(
      `SELECT
         pe.id, pe.patient_id, pe.vas_score, pe.free_text, pe.created_at,
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
       WHERE pe.patient_id = $1
       GROUP BY pe.id
       ORDER BY pe.created_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, limit, offset]
    );

    const totalRes = await query(
      `SELECT COUNT(*)::int AS cnt FROM pain_entries WHERE patient_id = $1`,
      [patientId]
    );

    return res.json({ data: rows, total: totalRes.rows[0].cnt });
  } catch (err) {
    console.error('GET /rehab/pain error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить историю' });
  }
});
```

**Замечание:** middleware `authenticatePatient` и `authenticatePatientOrInstructor` уже существуют (см. CLAUDE.md, используются на `/api/progress`). Импортируем их в верху файла, если ещё не импортированы.

**Замечание про `req.user.patient_id`:** в verify-step Claude Code должен подтвердить как именно достаётся patient_id. Если он лежит в `req.user.patient_id` напрямую — код выше работает. Если требуется SQL lookup — обернуть в helper в верху файла или middleware. Не делать SQL lookup внутри каждого endpoint'а — DRY.

### E) `backend/routes/admin.js` — ops-alerts endpoints

```javascript
// === Ops Alerts (Wave 2 коммит 2.04) ===

/**
 * GET /api/admin/ops-alerts
 * Список алертов. Query:
 *  - resolved: 'true'|'false'|undefined (default — все)
 *  - alert_type: filter
 *  - severity: filter
 *  - patient_id: filter
 *  - limit (default 50), offset
 */
router.get('/ops-alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { resolved, alert_type, severity, patient_id } = req.query;
    const conditions = [];
    const params = [];

    if (resolved === 'true') conditions.push('resolved_at IS NOT NULL');
    else if (resolved === 'false') conditions.push('resolved_at IS NULL');
    if (alert_type) { params.push(alert_type); conditions.push(`alert_type = $${params.length}`); }
    if (severity)   { params.push(severity);   conditions.push(`severity   = $${params.length}`); }
    if (patient_id) { params.push(parseInt(patient_id, 10)); conditions.push(`patient_id = $${params.length}`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    params.push(limit); params.push(offset);

    const { rows } = await query(
      `SELECT
         oa.id, oa.patient_id, p.full_name AS patient_name,
         oa.alert_type, oa.severity,
         oa.source_entity_type, oa.source_entity_id,
         oa.details, oa.telegram_message_id, oa.telegram_sent_at, oa.telegram_send_error,
         oa.resolved_at, oa.resolved_by_user_id, oa.resolution_notes,
         oa.created_at
       FROM ops_alerts oa
       LEFT JOIN patients p ON p.id = oa.patient_id
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
 * Body: { resolution_notes? }
 */
router.put('/ops-alerts/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ValidationError', message: 'id должен быть числом' });
  const { resolution_notes } = req.body;

  try {
    const { rows } = await query(
      `UPDATE ops_alerts
       SET resolved_at = NOW(), resolved_by_user_id = $1, resolution_notes = $2, updated_at = NOW()
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
jest.mock('../../services/opsAlerts');
const opsAlertsService = require('../../services/opsAlerts');

describe('Pain endpoints (Wave 2 коммит 2.04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock patient auth — req.user.patient_id = 14
    require('../../middleware/auth').authenticatePatient = jest.fn((req, _res, next) => {
      req.user = { id: 99, role: 'patient', patient_id: 14 };
      next();
    });
    require('../../middleware/auth').authenticatePatientOrInstructor = jest.fn((req, _res, next) => {
      req.user = { id: 99, role: 'patient', patient_id: 14 };
      next();
    });
    // Mock getClient для транзакций
    const mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
    db.__mockClient = mockClient;
  });

  describe('GET /rehab/pain-locations', () => {
    it('возвращает локации program_type пациента', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ program_type: 'acl' }] })  // patient lookup
        .mockResolvedValueOnce({ rows: [
          { code: 'knee_anterior', label: 'Передняя', position: 10, is_red_flag: false },
          { code: 'calf_posterior', label: 'Икроножная', position: 80, is_red_flag: true }
        ]});

      const res = await request(app).get('/api/rehab/pain-locations');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('404 если patient не найден', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/rehab/pain-locations');
      expect(res.status).toBe(404);
    });

    it('возвращает пустой массив если patient.program_type = null', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ program_type: null }] });
      const res = await request(app).get('/api/rehab/pain-locations');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /rehab/pain', () => {
    it('создаёт pain_entry без red-flag — не вызывает createOpsAlert', async () => {
      db.__mockClient.query
        .mockResolvedValueOnce(undefined)  // BEGIN
        .mockResolvedValueOnce({ rows: [
          { code: 'knee_anterior', label: 'Передняя', is_red_flag: false, red_flag_reason: null }
        ]})  // locations check
        .mockResolvedValueOnce({ rows: [{ id: 50, patient_id: 14, vas_score: 5, created_at: new Date() }] })  // INSERT pain_entry
        .mockResolvedValueOnce(undefined)  // INSERT pain_entry_locations
        .mockResolvedValueOnce(undefined); // COMMIT

      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 5, location_codes: ['knee_anterior'] });

      expect(res.status).toBe(201);
      expect(res.body.data.ops_alert).toBeNull();
      expect(opsAlertsService.createOpsAlert).not.toHaveBeenCalled();
    });

    it('создаёт pain_entry с red-flag локацией — вызывает createOpsAlert', async () => {
      db.__mockClient.query
        .mockResolvedValueOnce(undefined)  // BEGIN
        .mockResolvedValueOnce({ rows: [
          { code: 'calf_posterior', label: 'Икроножная', is_red_flag: true, red_flag_reason: 'ТГВ' }
        ]})
        .mockResolvedValueOnce({ rows: [{ id: 51, patient_id: 14, vas_score: 7, created_at: new Date() }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      db.query.mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'Тест', phone: '+7900', email: 't@t.ru' }] });
      opsAlertsService.formatRedFlagPainMessage.mockReturnValue('🚨 ...');
      opsAlertsService.createOpsAlert.mockResolvedValue({ ops_alert_id: 200, telegram_sent: true });

      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 7, location_codes: ['calf_posterior'] });

      expect(res.status).toBe(201);
      expect(opsAlertsService.createOpsAlert).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 14,
        alert_type: 'red_flag_pain',
        severity: 'high'
      }));
      expect(res.body.data.ops_alert.ops_alert_id).toBe(200);
      expect(res.body.message).toMatch(/уведомление о красном флаге/);
    });

    it('createOpsAlert упал — pain_entry всё равно создан, status 201', async () => {
      db.__mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ code: 'calf_posterior', label: 'Икр', is_red_flag: true, red_flag_reason: 'ТГВ' }] })
        .mockResolvedValueOnce({ rows: [{ id: 52, patient_id: 14, vas_score: 8, created_at: new Date() }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      db.query.mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'X' }] });
      opsAlertsService.formatRedFlagPainMessage.mockReturnValue('msg');
      opsAlertsService.createOpsAlert.mockRejectedValue(new Error('Telegram unreachable'));

      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 8, location_codes: ['calf_posterior'] });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(52);
    });

    it('400 — vas_score вне диапазона 0..10', async () => {
      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 15, location_codes: ['knee_anterior'] });
      expect(res.status).toBe(400);
    });

    it('400 — пустой location_codes', async () => {
      const res = await request(app).post('/api/rehab/pain').send({ vas_score: 5, location_codes: [] });
      expect(res.status).toBe(400);
    });

    it('400 — неизвестная локация', async () => {
      db.__mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ code: 'knee_anterior', is_red_flag: false }] });  // только 1 из 2 найден
      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 5, location_codes: ['knee_anterior', 'nonexistent_loc'] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/nonexistent_loc/);
    });

    it('400 — free_text слишком длинный', async () => {
      const longText = 'x'.repeat(1001);
      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 5, location_codes: ['knee_anterior'], free_text: longText });
      expect(res.status).toBe(400);
    });

    it('400 — больше 16 локаций', async () => {
      const codes = Array.from({ length: 17 }, (_, i) => `loc_${i}`);
      const res = await request(app)
        .post('/api/rehab/pain')
        .send({ vas_score: 5, location_codes: codes });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /rehab/pain', () => {
    it('пациент получает свою историю', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [
          { id: 1, vas_score: 5, locations: [{ code: 'knee_anterior', label: 'Передняя', is_red_flag: false }] }
        ]})
        .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
      const res = await request(app).get('/api/rehab/pain');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('инструктор — требует patient_id query param', async () => {
      require('../../middleware/auth').authenticatePatientOrInstructor = jest.fn((req, _res, next) => {
        req.user = { id: 1, role: 'instructor' };
        next();
      });
      const res = await request(app).get('/api/rehab/pain');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/patient_id обязателен/);
    });

    it('limit/offset работают', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
      const res = await request(app).get('/api/rehab/pain?limit=10&offset=20');
      expect(res.status).toBe(200);
      // Проверить что SQL получил правильные limit/offset
      const limitParam = db.query.mock.calls[0][1][1];
      const offsetParam = db.query.mock.calls[0][1][2];
      expect(limitParam).toBe(10);
      expect(offsetParam).toBe(20);
    });
  });
});
```

### `backend/tests/__tests__/opsAlerts.test.js` (НОВЫЙ)

```javascript
const db = require('../../database/db');
jest.mock('../../database/db');

// Mock bot module
jest.mock('../../bot/instance', () => ({
  bot: { sendMessage: jest.fn() }
}), { virtual: true });

const { createOpsAlert, formatRedFlagPainMessage } = require('../../services/opsAlerts');
const { bot } = require('../../bot/instance');

describe('opsAlerts service (Wave 2 коммит 2.04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPS_ALERT_CHAT_ID = '111222333';
  });

  describe('createOpsAlert', () => {
    it('создаёт ops_alert + отправляет Telegram + апдейтит message_id', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 500 }] })  // INSERT ops_alerts
        .mockResolvedValueOnce({ rows: [] });            // UPDATE telegram_message_id
      bot.sendMessage.mockResolvedValue({ message_id: 99999 });

      const result = await createOpsAlert({
        patient_id: 14,
        alert_type: 'red_flag_pain',
        severity: 'high',
        source_entity_type: 'pain_entry',
        source_entity_id: 50,
        details: { vas_score: 8 },
        telegram_message: '🚨 Test'
      });

      expect(result.ops_alert_id).toBe(500);
      expect(result.telegram_sent).toBe(true);
      expect(bot.sendMessage).toHaveBeenCalledWith('111222333', '🚨 Test', { parse_mode: 'HTML' });
      // Проверить UPDATE с message_id
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toMatch(/UPDATE ops_alerts SET telegram_message_id/);
      expect(updateCall[1][0]).toBe('99999');
    });

    it('если OPS_ALERT_CHAT_ID пустой — alert создаётся, telegram_sent=false', async () => {
      delete process.env.OPS_ALERT_CHAT_ID;
      db.query.mockResolvedValueOnce({ rows: [{ id: 501 }] });

      const result = await createOpsAlert({
        patient_id: 14, alert_type: 'red_flag_pain', severity: 'high',
        source_entity_type: 'pain_entry', source_entity_id: 50,
        details: {}, telegram_message: 'X'
      });

      expect(result.telegram_sent).toBe(false);
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('если bot.sendMessage упал — alert создан, error записан', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 502 }] })  // INSERT
        .mockResolvedValueOnce({ rows: [] });            // UPDATE telegram_send_error
      bot.sendMessage.mockRejectedValue(new Error('Network timeout'));

      const result = await createOpsAlert({
        patient_id: 14, alert_type: 'red_flag_pain', severity: 'high',
        source_entity_type: 'pain_entry', source_entity_id: 50,
        details: {}, telegram_message: 'X'
      });

      expect(result.telegram_sent).toBe(false);
      const errCall = db.query.mock.calls.find(c => /telegram_send_error/.test(c[0]));
      expect(errCall).toBeDefined();
      expect(errCall[1][0]).toMatch(/Network timeout/);
    });
  });

  describe('formatRedFlagPainMessage', () => {
    it('включает имя пациента, VAS, локации с reason', () => {
      const msg = formatRedFlagPainMessage({
        patient: { id: 14, full_name: 'Иван И.', phone: '+7900' },
        pain_entry: { id: 50, vas_score: 8, free_text: 'болит сильно', created_at: new Date('2026-05-16T10:00:00') },
        locations_data: [
          { code: 'calf_posterior', label: 'Икроножная', is_red_flag: true, red_flag_reason: 'ТГВ' }
        ]
      });
      expect(msg).toMatch(/Иван И/);
      expect(msg).toMatch(/8\/10/);
      expect(msg).toMatch(/Икроножная/);
      expect(msg).toMatch(/ТГВ/);
      expect(msg).toMatch(/болит сильно/);
    });

    it('escape HTML спецсимволов', () => {
      const msg = formatRedFlagPainMessage({
        patient: { id: 14, full_name: '<script>alert("xss")</script>' },
        pain_entry: { id: 50, created_at: new Date() },
        locations_data: []
      });
      expect(msg).not.toMatch(/<script>/);
      expect(msg).toMatch(/&lt;script&gt;/);
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

  it('GET /admin/ops-alerts — список', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 1, patient_id: 14, alert_type: 'red_flag_pain', resolved_at: null },
      { id: 2, patient_id: 15, alert_type: 'red_flag_pain', resolved_at: new Date() }
    ]});
    const res = await request(app).get('/api/admin/ops-alerts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET ?resolved=false — фильтр', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, resolved_at: null }] });
    const res = await request(app).get('/api/admin/ops-alerts?resolved=false');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toMatch(/resolved_at IS NULL/);
  });

  it('PUT /:id/resolve — резолвит + audit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, resolved_at: new Date(), resolved_by_user_id: 1 }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/admin/ops-alerts/1/resolve').send({ resolution_notes: 'OK' });
    expect(res.status).toBe(200);
    const auditCall = db.query.mock.calls.find(c => /INSERT INTO audit_logs/.test(c[0]));
    expect(auditCall).toBeDefined();
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

  it('GET с patient_id filter', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/admin/ops-alerts?patient_id=14');
    expect(db.query.mock.calls[0][1]).toContain(14);
  });
});
```

---

## NOT TOUCH

- Frontend (это 2.05)
- pain_locations schema/data (2.01/2.02)
- Existing Telegram diary reminder logic
- LOCKED-зоны
- JARVIS Director
- routes/admin.js существующие endpoints (только extend секцией ops-alerts)

---

## Smoke test

### Сценарий 1 — миграция

```bash
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260519_ops_alerts.sql
psql -U postgres -d azarean_rehab -c "\d ops_alerts"
psql -U postgres -d azarean_rehab -c "\di ops_alerts*"  # индексы
```

**Ожидание:** таблица + 3 индекса.

### Сценарий 2 — pain endpoint без red-flag

```bash
# Login as patient
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/patient/login \
  -H 'Content-Type: application/json' -c /tmp/cookies.txt \
  -d '{"email":"avi707@mail.ru","password":"Test1234"}' | jq -r '.data.token')

# Without red-flag (knee_anterior)
curl -s -X POST -b /tmp/cookies.txt -H 'Content-Type: application/json' \
  -d '{"vas_score": 4, "location_codes": ["knee_anterior"], "free_text": "после тренировки"}' \
  http://localhost:5000/api/rehab/pain | jq

# Должен 201, ops_alert: null
```

### Сценарий 3 — red-flag pain → ops_alert + Telegram

```bash
# Установи OPS_ALERT_CHAT_ID в .env на свой реальный chat_id, перезапусти backend
curl -s -X POST -b /tmp/cookies.txt -H 'Content-Type: application/json' \
  -d '{"vas_score": 8, "location_codes": ["calf_posterior"], "free_text": "икра болит и отёк"}' \
  http://localhost:5000/api/rehab/pain | jq

# Должен 201, ops_alert: { ops_alert_id: N, telegram_sent: true }
# В Telegram DM должно прийти 🚨 КРАСНЫЙ ФЛАГ сообщение

# Проверить запись в БД
psql -U postgres -d azarean_rehab -c \
  "SELECT id, alert_type, severity, telegram_message_id, telegram_sent_at FROM ops_alerts ORDER BY id DESC LIMIT 1;"
```

### Сценарий 4 — admin triage

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vadim@azarean.com","password":"Test1234"}' | jq -r '.data.token')

# Все unresolved
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  'http://localhost:5000/api/admin/ops-alerts?resolved=false' | jq '.data | length'

# Резолв
ALERT_ID=<id из предыдущего шага>
curl -s -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"resolution_notes":"Связался, направил на УЗИ"}' \
  http://localhost:5000/api/admin/ops-alerts/$ALERT_ID/resolve | jq

# Проверить audit_logs
psql -U postgres -d azarean_rehab -c \
  "SELECT action, entity_type, entity_id, details FROM audit_logs WHERE entity_type='ops_alert' ORDER BY id DESC LIMIT 3;"
```

### Сценарий 5 — Telegram недоступен (graceful degrade)

```bash
# Установи OPS_ALERT_CHAT_ID="" (пустой) или несуществующий chat_id
# Послать red-flag pain → должен вернуться 201, ops_alert создан, telegram_sent=false
# В логах backend — warning о Telegram failure
# psql: SELECT telegram_send_error FROM ops_alerts ORDER BY id DESC LIMIT 1;
```

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260519_ops_alerts.sql`
- `backend/services/opsAlerts.js`
- `backend/tests/__tests__/rehab.pain.test.js`
- `backend/tests/__tests__/opsAlerts.test.js`

### Изменить
- `backend/routes/rehab.js` (+~250 строк — 3 endpoints)
- `backend/routes/admin.js` (+~80 строк — 2 endpoints)
- `backend/.env.example` (+ `OPS_ALERT_CHAT_ID`)
- `backend/tests/__tests__/admin.routes.test.js` (+~6 тестов)
- `CLAUDE.md` (миграция + endpoints + env var)

### НЕ ТРОГАТЬ
- Frontend
- `backend/database/schema.sql`
- LOCKED-зоны

---

## Текст коммита

```
feat(rehab): Wave 2 — pain endpoints + red-flag automation + ops-alert

Wave 2 коммит 2.04 — Block B Pain Tracking. Открывает backend для
structured pain logging с автоматическим инцидент-каналом.

Backend:
- Migration 20260519_ops_alerts.sql — таблица ops_alerts с
  telegram tracking (message_id, sent_at, send_error) и resolution
  fields (resolved_at, resolved_by, notes). 3 индекса для типичных
  query patterns.
- routes/rehab.js — 3 endpoints:
  GET /rehab/pain-locations (public для patient, фильтр по program_type),
  POST /rehab/pain (создать pain_entry с локациями, транзакционно),
  GET /rehab/pain (история; patient свою, instructor через ?patient_id).
- services/opsAlerts.js — helper createOpsAlert + formatRedFlagPainMessage.
  Failure Telegram не падает основной flow (записывается в send_error,
  ops_alert всё равно создаётся). HTML escape для пользовательского ввода.
- routes/admin.js — 2 endpoints:
  GET /admin/ops-alerts (filter resolved/type/severity/patient_id),
  PUT /admin/ops-alerts/:id/resolve. С logAudit.

Red-flag flow:
- POST /rehab/pain получает location_codes
- При наличии локации с is_red_flag=true → createOpsAlert
- Запись в ops_alerts (severity='high') + DM в Telegram чат
  OPS_ALERT_CHAT_ID (читается из env)
- Response пациенту включает ops_alert: { ops_alert_id, telegram_sent }

Tests:
- backend +20 rehab.pain + 10 opsAlerts + 6 admin ops-alerts = +36

Не трогает frontend (это 2.05). Не интегрирует Telegraf — только
существующий node-telegram-bot-api 0.67.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- Секция «Запуск проекта → PostgreSQL» — добавить миграцию 20260519
- Секция «Запуск проекта → .env» — добавить `OPS_ALERT_CHAT_ID`
- Секция «API endpoints → Rehab» — добавить 3 строки pain endpoints
- Секция «API endpoints → Admin» — добавить 2 строки ops-alerts
- Секция «Завершённые исправления» — запись:
  > **Wave 2 коммит 2.04** — Pain endpoints + red-flag automation + ops_alerts (Telegram + DB). Открыт Block B Pain Tracking. Telegram failure graceful degrade.

**Memory:**
- `wave_2_progress.md` — статус 2.04 → ⏸ заморожен, SHA, метрики, smoke результат
- Записать в notes: на что обратить внимание Vadim'у при первом red-flag на пилоте — реалистичность форматирования сообщения, время доставки, нужен ли rate-limit/dedup

---

## Definition of Done

- [ ] Verify-step выполнен: pain_locations seed подтверждён, bot instance путь установлен, patient_id pattern зафиксирован
- [ ] Миграция 20260519 применена, ops_alerts таблица + 3 индекса видны
- [ ] `OPS_ALERT_CHAT_ID` добавлен в `.env.example` (real value — в production `.env`, не в коммите)
- [ ] services/opsAlerts.js: createOpsAlert работает без bot instance (graceful) и без CHAT_ID (warning); HTML escape работает
- [ ] POST /rehab/pain — создаёт entry + locations транзакционно
- [ ] POST /rehab/pain без red-flag — ops_alert не создаётся
- [ ] POST /rehab/pain с red-flag — ops_alert создан, telegram_sent_at заполнен (если bot+CHAT_ID работают)
- [ ] POST /rehab/pain — failure Telegram не откатывает pain_entry (status 201 всё равно)
- [ ] GET /rehab/pain-locations возвращает локации program_type пациента
- [ ] GET /rehab/pain — patient свою историю; instructor через ?patient_id
- [ ] GET /admin/ops-alerts filters работают (resolved, alert_type, severity, patient_id)
- [ ] PUT /admin/ops-alerts/:id/resolve — резолвит, audit_log запись
- [ ] Все ~36 новых тестов зелёные
- [ ] Existing тесты не сломаны (backend после 2.01-2.04: ≥ 487 + 36 = ~523)
- [ ] Smoke сценарий 3 проигран на dev с реальным Telegram (Vadim получает 🚨 сообщение)
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] `wave_2_progress.md` — статус 2.04 → ⏸ заморожен
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт от ветки `wave-2/04-pain-backend`, висит до конца Wave 2

---

## После 2.04

**Block B наполовину закрыт.** 2.05 (frontend DiaryScreen + Pain Event SOS) — следующий. Архитектор:
- Подождёт smoke-результата 2.04 (особенно UX красного флага в реальном Telegram'е) → может скорректировать формат сообщения
- Подождёт замороженного 2.02 на ветке — Vadim увидит PainLocationsTab → даст UX-фидбек → влияет на frontend pain creation UI в 2.05
- Напишет TZ 2.05 после получения этих двух сигналов

**Backlog hot-fixes выявленные при 2.04:**
- Rate-limit / dedup для ops_alert Telegram (если пациент пришлёт 10 red-flag entries за час — нужно ли 10 уведомлений?). Решим после первого реального инцидента на пилоте.
- Resolve flow в Admin UI (сейчас только через curl/Postman). Когда Vadim начнёт получать алерты на пилоте — appetit для UI появится.
