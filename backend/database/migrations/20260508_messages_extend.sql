-- =====================================================
-- 2026-05-08 · Wave 0 commit 03
-- Расширение messages для типизированных отчётов из дневника
-- =====================================================
--
-- Добавляет message_kind с whitelist'ом:
--   text         (default) — обычное сообщение
--   diary_report — отчёт по записи дневника, требует linked_diary_id
--   session_report — зарезервировано для Волны 3 (отчёт по тренировке)
--   system_alert — зарезервировано
--
-- linked_diary_id уже существует (добавлен в 20260421_diary_structured_fields).
--
-- Идемпотентна (DO-блок проверяет наличие колонки).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_kind'
  ) THEN
    ALTER TABLE messages
      ADD COLUMN message_kind VARCHAR(30) NOT NULL DEFAULT 'text'
        CHECK (message_kind IN ('text', 'diary_report', 'session_report', 'system_alert'));
  END IF;
END $$;
