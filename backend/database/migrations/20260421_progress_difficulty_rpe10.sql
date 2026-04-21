-- Миграция: расширить progress_logs.difficulty_rating до RPE 1..10
--
-- Причина: шкала сложности в ExerciseRunner v3 (2026-04-13) — это Borg CR-10
-- RPE scale, принимает значения 1..10. Старый CHECK на 1..5 остался от
-- самой первой версии приложения (Phase 1 Sprint) и ронял каждый INSERT
-- с difficulty >= 6 как 500 Internal Server Error.
--
-- Дополнительно: пациент, не поставивший сложность, отправляет 0 — чтобы
-- это не падало в БД, сохраняем запрет на 0 в CHECK (это корректная защита
-- от "не выбрано"), а на фронте из ExerciseRunner будем слать null вместо 0.

ALTER TABLE progress_logs
  DROP CONSTRAINT IF EXISTS progress_logs_difficulty_rating_check;

ALTER TABLE progress_logs
  ADD CONSTRAINT progress_logs_difficulty_rating_check
  CHECK (difficulty_rating IS NULL OR (difficulty_rating >= 1 AND difficulty_rating <= 10));
