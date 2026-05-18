-- Wave 2 коммит 2.04 — ops_alerts (SLIM)
-- Назначение: incident-журнал для admin triage с resolve flow.
-- Telegram отправка и dedup — в utils/opsAlert.js (Wave 1 fix #50, не дублируем).
-- Источник записей: routes/rehab.js triggerRedFlagAlert при создании red-flag pain_entry.
-- Будущие источники: overdue diary, criterion stuck и т.п.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_alerts (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  alert_type      VARCHAR(50) NOT NULL,                -- 'red_flag_pain', future: 'overdue_diary', ...
  severity        VARCHAR(20) NOT NULL DEFAULT 'high', -- 'low','medium','high','critical'
  source_entity_type VARCHAR(50),                      -- 'pain_entry'
  source_entity_id   INTEGER,                          -- pain_entries.id для JOIN в admin триаже
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Tracking — Telegram отправка, без message_id (это в utils/opsAlert.js)
  telegram_attempted_at TIMESTAMP,
  telegram_dedup_key    VARCHAR(255),
  -- Resolution
  resolved_at         TIMESTAMP,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes    TEXT,
  -- Audit
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_ops_alerts_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_ops_alerts_resolved_pair CHECK (
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

-- Trigger updated_at (если в проекте есть общая функция — подключаем)
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
