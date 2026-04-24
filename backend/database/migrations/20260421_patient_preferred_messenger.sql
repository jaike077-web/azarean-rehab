-- =====================================================
-- Migration: preferred_messenger + messages.linked_diary_id + channel
-- Дата: 2026-04-21
-- Сессия 1, Checkpoint 2 (см. AZAREAN_V12_IMPLEMENTATION.md)
--
-- Цель:
--  1. Multi-channel support — пациент выбирает основной канал связи
--     (Telegram / WhatsApp / MAX). Используется MessengerCTA для
--     выбора куда уйдёт «отправить отчёт» / «ответить Татьяне».
--  2. Связь ответа куратора с конкретной записью дневника —
--     messages.linked_diary_id + опциональный channel (через какой
--     канал пришло сообщение, если не in-app).
-- =====================================================

-- ─── 1. patients.preferred_messenger ───────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS preferred_messenger VARCHAR(20) NOT NULL DEFAULT 'telegram';

-- CHECK constraint отдельным шагом через DROP+ADD — идемпотентно
ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_preferred_messenger_check;
ALTER TABLE patients
  ADD CONSTRAINT patients_preferred_messenger_check
  CHECK (preferred_messenger IN ('telegram', 'whatsapp', 'max'));

-- Индекс — на случай аналитики «сколько пациентов какой канал выбрали»
-- + фильтрация рассылок по предпочтению. Partial — только активные.
CREATE INDEX IF NOT EXISTS idx_patients_preferred_messenger
  ON patients(preferred_messenger)
  WHERE is_active = true;

-- ─── 2. messages.linked_diary_id + channel ─────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS linked_diary_id INTEGER
    REFERENCES diary_entries(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_channel_check
  CHECK (channel IN ('telegram', 'whatsapp', 'max', 'in_app') OR channel IS NULL);

-- Индекс на linked_diary_id — для запроса «все сообщения, привязанные к
-- конкретной записи дневника» (feedback card в ContactScreen). Partial —
-- большинство сообщений будут без привязки.
CREATE INDEX IF NOT EXISTS idx_messages_linked_diary_id
  ON messages(linked_diary_id)
  WHERE linked_diary_id IS NOT NULL;

-- =====================================================
-- ROLLBACK (для PR-описания, не для исполнения):
--
-- DROP INDEX IF EXISTS idx_messages_linked_diary_id;
-- ALTER TABLE messages DROP COLUMN IF EXISTS channel;
-- ALTER TABLE messages DROP COLUMN IF EXISTS linked_diary_id;
-- DROP INDEX IF EXISTS idx_patients_preferred_messenger;
-- ALTER TABLE patients DROP COLUMN IF EXISTS preferred_messenger;
-- =====================================================
