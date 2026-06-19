-- =====================================================
-- 20260619_exercise_variations_progression.sql
--
-- Добавляет в библиотеку упражнений ДВА пациент-видимых текстовых поля:
--   exercises.variations   TEXT — варианты упражнения (усложнение/облегчение,
--                                 с весом / без, альтернативные исходные положения).
--   exercises.progression  TEXT — как прогрессировать (фаза→фаза, от простого к сложному).
--
-- Оба поля свободного текста, nullable, без значения по умолчанию (NULL = не задано).
-- Видны пациенту наравне с instructions/description (отдаются в payload my-complexes /
-- my/exercises и рендерятся в карточке упражнения).
--
-- Аддитивно и идемпотентно (DO-блок + information_schema проверка колонок).
-- Применять через deploy/migrate.sh (checksum-tracking). LF.
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'variations'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN variations TEXT;
    RAISE NOTICE 'exercises.variations: added (TEXT, nullable)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'progression'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN progression TEXT;
    RAISE NOTICE 'exercises.progression: added (TEXT, nullable)';
  END IF;
END $$;
