-- Wave 1 коммит 1.09: phase_stuck_alerts — таблица для дедупликации
-- yellow/red alerts по программе. Создаётся cron-задачей checkStuckPhases()
-- раз в неделю; UNIQUE гарантирует один alert на (program, phase, level).
-- Red-alert с notified_instructor=TRUE означает «push куратору отправлен»
-- — повторно слать не нужно даже при следующем cron-прогоне.
--
-- resolved_at — для будущего: когда инструктор поднимет фазу руками или
-- закроет программу, флаг помечает alert closed (NULL = unresolved).
-- В рамках 1.09 заполняется только NULL'ом — UI инструктора для resolve
-- — backlog. Партиал-индекс по unresolved готов для будущих EXISTS-агрегатов.

BEGIN;

CREATE TABLE IF NOT EXISTS phase_stuck_alerts (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  phase_number SMALLINT NOT NULL,
  threshold_level VARCHAR(10) NOT NULL CHECK (threshold_level IN ('yellow', 'red')),
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  notified_instructor BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMP,
  UNIQUE (program_id, phase_number, threshold_level)
);

CREATE INDEX IF NOT EXISTS idx_phase_stuck_alerts_program
  ON phase_stuck_alerts(program_id);

CREATE INDEX IF NOT EXISTS idx_phase_stuck_alerts_unresolved
  ON phase_stuck_alerts(program_id) WHERE resolved_at IS NULL;

COMMIT;
