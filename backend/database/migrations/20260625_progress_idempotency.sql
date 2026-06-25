-- =====================================================
-- Идемпотентность progress_logs (Этап 4 hardening)
-- -----------------------------------------------------
-- Проблема: повторный POST /api/progress (ретрай после refresh / потеря ответа
-- при той же session) создавал ДУБЛЬ строки с тем же
-- (complex_id, exercise_id, session_id), искажая per-exercise агрегаты боли и
-- сложности у инструктора (COUNT/AVG задваивались).
-- Фикс: partial UNIQUE-индекс на тройку + ON CONFLICT DO UPDATE (last-write-wins)
-- в routes/progress.js. session_id IS NULL не дедупим (нет сессии — нечего
-- объединять; такие записи как раньше всегда INSERT).
-- Полностью идемпотентна: dedup естественно (повтор находит 0 дублей) +
-- CREATE UNIQUE INDEX IF NOT EXISTS.
-- =====================================================

-- 1. Удаляем существующие дубли (оставляем самую свежую строку по id) —
--    иначе CREATE UNIQUE INDEX упал бы на проде, где дубли уже накопились.
DELETE FROM progress_logs a
USING progress_logs b
WHERE a.session_id IS NOT NULL
  AND a.session_id  = b.session_id
  AND a.complex_id  = b.complex_id
  AND a.exercise_id = b.exercise_id
  AND a.id < b.id;

-- 2. Partial UNIQUE-индекс. Под него цепляется ON CONFLICT в коде
--    (с тем же предикатом WHERE session_id IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_logs_idem
  ON progress_logs (complex_id, exercise_id, session_id)
  WHERE session_id IS NOT NULL;
