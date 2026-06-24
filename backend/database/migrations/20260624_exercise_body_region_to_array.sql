-- 2026-06-24 — exercises.body_region VARCHAR(50) → TEXT[] (мультивыбор региона тела).
-- Многосуставные упражнения (присед = колено + ТБС) больше не теряют регион: AI и
-- инструктор перечисляют ВСЕ задействованные суставы вместо одного-«победителя».
-- Образец: 20260520_pain_character_to_array (VARCHAR → TEXT[] через USING).
--
-- БЕЗ строгого whitelist-CHECK на значения: легаси body_region — свободный VARCHAR,
-- CSV-импорт мог занести произвольный текст («Бедро»/«Колено» из шаблона import.js).
-- Жёсткий `<@ ARRAY[коды]` отверг бы такие строки при конверсии → упавший деплой.
-- Чистоту канонических кодов держит APP-слой: чекбоксы фронта (только валидные коды) +
-- mapArray в backend/utils/exerciseStructuring.js. CHECK здесь — только защита формы
-- (непустой массив без пустых элементов), не справочник значений.
--
-- Идемпотентно (DO block + data_type check). ВАЖНО: pg_dump backup ОБЯЗАТЕЛЕН перед
-- apply — конверсия типа колонки не реверсируется без backup.

BEGIN;

DO $$
DECLARE
  v_column_type TEXT;
BEGIN
  -- 1. Текущий тип колонки
  SELECT data_type INTO v_column_type
  FROM information_schema.columns
  WHERE table_name = 'exercises' AND column_name = 'body_region';

  IF v_column_type = 'character varying' THEN
    -- 2. Старый btree-индекс на скаляр бесполезен для массива (для @> нужен GIN, ниже).
    -- Дроп ДО ALTER TYPE: иначе он молча перестроится как btree(text[]).
    DROP INDEX IF EXISTS idx_exercises_body_region;

    -- 3. Конверсия типа. USING: single string → ARRAY[string], NULL/'' → NULL.
    ALTER TABLE exercises
      ALTER COLUMN body_region TYPE TEXT[]
      USING (
        CASE
          WHEN body_region IS NULL THEN NULL
          WHEN btrim(body_region) = '' THEN NULL
          ELSE ARRAY[btrim(body_region)]
        END
      );

    RAISE NOTICE 'Migrated exercises.body_region VARCHAR(50) → TEXT[]';
  ELSE
    RAISE NOTICE 'exercises.body_region already type %, skipping conversion', v_column_type;
  END IF;
END $$;

-- 4. Defensive CHECK (форма, НЕ whitelist значений): NULL разрешён (= «регион не указан»);
-- иначе массив непустой и без пустых элементов. array_length(ARRAY[],1)=NULL → COALESCE→0.
-- Idempotent: DROP IF EXISTS перед ADD.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS chk_exercises_body_region;
ALTER TABLE exercises ADD CONSTRAINT chk_exercises_body_region
CHECK (
  body_region IS NULL OR (
    COALESCE(array_length(body_region, 1), 0) > 0
    AND NOT ('' = ANY(body_region))
  )
);

-- 5. GIN-индекс под array-containment фильтр (body_region @> ARRAY[...]).
CREATE INDEX IF NOT EXISTS idx_exercises_body_region ON exercises USING gin (body_region);

COMMIT;

-- Verification (после миграции):
-- 1. Тип = ARRAY:
--    SELECT data_type FROM information_schema.columns
--    WHERE table_name='exercises' AND column_name='body_region';   -- ARRAY
-- 2. CHECK существует:
--    SELECT conname FROM pg_constraint
--    WHERE conrelid='exercises'::regclass AND conname='chk_exercises_body_region';
-- 3. GIN-индекс:
--    SELECT indexdef FROM pg_indexes WHERE indexname='idx_exercises_body_region';  -- USING gin
-- 4. Данные сохранены как 1-элементные массивы:
--    SELECT id, body_region FROM exercises WHERE body_region IS NOT NULL;
