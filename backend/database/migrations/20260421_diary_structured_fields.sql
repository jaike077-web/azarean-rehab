-- =====================================================
-- Миграция: структурные поля дневника + таблица фото (Checkpoint 6)
-- =====================================================
-- Закрывает bug #6 (сериализация structured-данных в notes через split('\n')).
-- Раньше текст дневника в notes выглядел как:
--   Боль: morning, day
--   Разгибание: Полное
--   Сгибание: 120°
-- и парсился регэкспами на фронте. Хрупко, ломалось от перевода строки.
-- Теперь — отдельные типизированные колонки.
-- =====================================================

ALTER TABLE diary_entries
  ADD COLUMN IF NOT EXISTS pgic_feel VARCHAR(10)
    CHECK (pgic_feel IS NULL OR pgic_feel IN ('better', 'same', 'worse')),
  ADD COLUMN IF NOT EXISTS rom_degrees INTEGER
    CHECK (rom_degrees IS NULL OR (rom_degrees >= 0 AND rom_degrees <= 180)),
  ADD COLUMN IF NOT EXISTS better_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pain_when VARCHAR(20)
    CHECK (pain_when IS NULL OR pain_when IN ('morning', 'day', 'evening', 'exercise', 'walking'));

-- Отдельная таблица для фото записи дневника (до 3 шт. на запись — лимит
-- enforced в application-слое POST /my/diary/:entry_id/photos).
CREATE TABLE IF NOT EXISTS diary_photos (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diary_photos_entry
  ON diary_photos(diary_entry_id);

-- Rollback (сохранено для справки, не выполняется):
--   DROP INDEX IF EXISTS idx_diary_photos_entry;
--   DROP TABLE IF EXISTS diary_photos;
--   ALTER TABLE diary_entries
--     DROP COLUMN IF EXISTS pain_when,
--     DROP COLUMN IF EXISTS better_list,
--     DROP COLUMN IF EXISTS rom_degrees,
--     DROP COLUMN IF EXISTS pgic_feel;
