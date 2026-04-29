-- =====================================================
-- 20260429: patient_deletion_queue — очередь soft → hard delete
-- =====================================================
-- 152-ФЗ ст.21 / GDPR Art.17 — пациент имеет право удалить свои данные.
-- Реализуем как «soft delete сразу + hard delete через 30 дней grace
-- period». В этот период:
--   - is_active=false → доступ к dashboard заблокирован
--   - данные физически в БД, можно восстановить (через support пока, UI в MVP нет)
--   - cron в scheduler.js раз в сутки в 03:00 Екб удаляет тех у кого
--     scheduled_for < NOW() (с CASCADE через FK)
--
-- Идемпотентна — IF NOT EXISTS.
-- =====================================================

CREATE TABLE IF NOT EXISTS patient_deletion_queue (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMP NOT NULL,
    reason TEXT,
    cancelled_at TIMESTAMP,
    executed_at TIMESTAMP
);

-- Partial UNIQUE: только ОДИН активный запрос на пациента
-- (выполненные / отменённые могут накапливаться при повторных циклах)
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_deletion_queue_active
    ON patient_deletion_queue (patient_id)
    WHERE executed_at IS NULL AND cancelled_at IS NULL;

-- Для cron lookup'а
CREATE INDEX IF NOT EXISTS idx_patient_deletion_queue_scheduled
    ON patient_deletion_queue (scheduled_for)
    WHERE executed_at IS NULL AND cancelled_at IS NULL;

COMMENT ON TABLE patient_deletion_queue IS
    'Очередь на hard-delete пациентов (152-ФЗ ст.21). После soft delete по запросу запись лежит здесь 30 дней (grace period), потом cron в scheduler.js удаляет patient + cascade.';
