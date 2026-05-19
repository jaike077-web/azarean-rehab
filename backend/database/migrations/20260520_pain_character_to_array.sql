-- Wave 2 Hot-fix #9 v2 — pain_character VARCHAR(50) → TEXT[]
-- Закрывает архитектурный drift #12 — multi-character клинически верный
-- (sharp+burning при cervical radiculopathy, throbbing+aching при vascular).
--
-- Идемпотентно — re-run после миграции пропускает (DO block + data_type check).
-- ВАЖНО: pg_dump backup ОБЯЗАТЕЛЕН перед applied. Conversion column type не
-- реверсируется без backup.

BEGIN;

DO $$
DECLARE
  v_column_type TEXT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Проверить текущий тип колонки
  SELECT data_type INTO v_column_type
  FROM information_schema.columns
  WHERE table_name = 'pain_entries' AND column_name = 'pain_character';

  IF v_column_type = 'character varying' THEN
    -- 2. Найти и удалить старый CHECK constraint (имя может варьироваться)
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'pain_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pain_character%'
    LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE pain_entries DROP CONSTRAINT %I', v_constraint_name);
      RAISE NOTICE 'Dropped old CHECK constraint: %', v_constraint_name;
    END IF;

    -- 3. Преобразовать column type VARCHAR → TEXT[]
    -- USING обрабатывает existing data: single string → ARRAY[string], NULL/'' → NULL.
    ALTER TABLE pain_entries
      ALTER COLUMN pain_character TYPE TEXT[]
      USING (
        CASE
          WHEN pain_character IS NULL THEN NULL
          WHEN pain_character::text = '' THEN NULL
          ELSE ARRAY[pain_character::TEXT]
        END
      );

    RAISE NOTICE 'Migrated pain_character VARCHAR(50) → TEXT[]';
  ELSE
    RAISE NOTICE 'pain_character already type %, skipping conversion', v_column_type;
  END IF;
END $$;

-- 4. Добавить новый CHECK constraint поэлементно (idempotent — DROP IF EXISTS перед ADD)
-- ВАЖНО: `array_length(ARRAY[]::TEXT[], 1) = NULL` в PostgreSQL, и `NULL > 0 = NULL` (не false),
-- поэтому пустой массив прошёл бы CHECK. Используем COALESCE → 0 для defensive отклонения.
-- Backend (routes/rehab.js) уже валидирует empty array → 400 как primary guard;
-- CHECK тут secondary defense на уровне БД.
ALTER TABLE pain_entries DROP CONSTRAINT IF EXISTS chk_pain_character_array;
ALTER TABLE pain_entries ADD CONSTRAINT chk_pain_character_array
CHECK (
  pain_character IS NULL OR (
    COALESCE(array_length(pain_character, 1), 0) > 0
    AND pain_character <@ ARRAY['aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other']::TEXT[]
  )
);

COMMIT;

-- Verification queries (выполнить после миграции):
-- 1. Тип колонки = ARRAY
--    SELECT data_type FROM information_schema.columns
--    WHERE table_name='pain_entries' AND column_name='pain_character';
--    Ожидание: ARRAY
-- 2. CHECK constraint существует с новым def
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid='pain_entries'::regclass AND contype='c'
--    AND pg_get_constraintdef(oid) LIKE '%pain_character%';
--    Ожидание: chk_pain_character_array с array_length + <@ check
-- 3. Existing data (если была) preserved as 1-element arrays
--    SELECT id, pain_character FROM pain_entries WHERE pain_character IS NOT NULL;
