-- =====================================================
-- Миграция: recovery schema drift между dev и prod (2026-04-24)
-- =====================================================
-- Контекст: dev БД была модифицирована SQL-ом вне миграций
-- (переименования category→body_region, difficulty→difficulty_level,
-- добавление movement_pattern/chain_type/joint/is_unilateral,
-- diagnoses.deleted_at/updated_at). Fresh install на prod 2026-04-23
-- применил schema.sql + все 20 миграций — эти колонки не появились,
-- что сломало /api/exercises и /api/diagnoses (500 Internal Server Error).
--
-- Полностью идемпотентна:
--   * ADD COLUMN только IF NOT EXISTS
--   * UPDATE only WHERE new IS NULL (не перезатирает уже мигрированные данные)
--   * DROP COLUMN только IF EXISTS
--   * Re-run — no-op
--
-- Маппинг difficulty (VARCHAR) → difficulty_level (INT):
--   beginner     → 1
--   intermediate → 3
--   advanced     → 5
-- (шаг 2 оставлен для будущего расширения: easy-medium-hard-expert)
-- =====================================================

-- =====================================================
-- 1. EXERCISES
-- =====================================================
DO $$
DECLARE
    has_category         BOOLEAN;
    has_body_part        BOOLEAN;
    has_body_region      BOOLEAN;
    has_difficulty       BOOLEAN;
    has_difficulty_level BOOLEAN;
BEGIN
    -- Инвентаризация текущего состояния
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='exercises' AND column_name='category')          INTO has_category;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='exercises' AND column_name='body_part')         INTO has_body_part;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='exercises' AND column_name='body_region')       INTO has_body_region;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='exercises' AND column_name='difficulty')        INTO has_difficulty;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='exercises' AND column_name='difficulty_level')  INTO has_difficulty_level;

    -- 1a. body_region: добавить если нет
    IF NOT has_body_region THEN
        ALTER TABLE exercises ADD COLUMN body_region VARCHAR(50);
        RAISE NOTICE 'Added exercises.body_region';
    END IF;

    -- 1b. Перенос данных category → body_region (если есть старая колонка)
    --     WHERE body_region IS NULL — защита от повторного вызова
    IF has_category THEN
        UPDATE exercises
           SET body_region = category
         WHERE body_region IS NULL AND category IS NOT NULL;
        RAISE NOTICE 'Migrated exercises.category → body_region';
    END IF;

    -- 1c. difficulty_level: добавить если нет
    IF NOT has_difficulty_level THEN
        ALTER TABLE exercises
          ADD COLUMN difficulty_level INTEGER
          CHECK (difficulty_level BETWEEN 1 AND 5);
        RAISE NOTICE 'Added exercises.difficulty_level';
    END IF;

    -- 1d. Перенос данных difficulty → difficulty_level
    IF has_difficulty THEN
        UPDATE exercises
           SET difficulty_level = CASE LOWER(difficulty)
               WHEN 'beginner'     THEN 1
               WHEN 'intermediate' THEN 3
               WHEN 'advanced'     THEN 5
               ELSE NULL
           END
         WHERE difficulty_level IS NULL AND difficulty IS NOT NULL;
        RAISE NOTICE 'Migrated exercises.difficulty → difficulty_level';
    END IF;

    -- 1e. Drop old columns — только ПОСЛЕ успешного UPDATE
    --     Данные уже перенесены, старые колонки не используются в коде
    IF has_category THEN
        ALTER TABLE exercises DROP COLUMN category;
        RAISE NOTICE 'Dropped exercises.category';
    END IF;

    IF has_body_part THEN
        ALTER TABLE exercises DROP COLUMN body_part;
        RAISE NOTICE 'Dropped unused exercises.body_part';
    END IF;

    IF has_difficulty THEN
        ALTER TABLE exercises DROP COLUMN difficulty;
        RAISE NOTICE 'Dropped exercises.difficulty';
    END IF;

    -- 1f. Дополнительные drift-колонки (frontend их использует условно)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exercises' AND column_name='movement_pattern') THEN
        ALTER TABLE exercises ADD COLUMN movement_pattern VARCHAR(50);
        RAISE NOTICE 'Added exercises.movement_pattern';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exercises' AND column_name='chain_type') THEN
        ALTER TABLE exercises ADD COLUMN chain_type VARCHAR(20);
        RAISE NOTICE 'Added exercises.chain_type';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exercises' AND column_name='joint') THEN
        ALTER TABLE exercises ADD COLUMN joint VARCHAR(100);
        RAISE NOTICE 'Added exercises.joint';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exercises' AND column_name='is_unilateral') THEN
        ALTER TABLE exercises ADD COLUMN is_unilateral BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added exercises.is_unilateral';
    END IF;
END $$;

-- Индексы (IF NOT EXISTS — идемпотентно)
CREATE INDEX IF NOT EXISTS idx_exercises_body_region ON exercises (body_region);
CREATE INDEX IF NOT EXISTS idx_exercises_type        ON exercises (exercise_type);


-- =====================================================
-- 2. DIAGNOSES
-- =====================================================
DO $$
BEGIN
    -- deleted_at (soft delete — используется в routes/diagnoses.js:24 WHERE deleted_at IS NULL)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='diagnoses' AND column_name='deleted_at') THEN
        ALTER TABLE diagnoses ADD COLUMN deleted_at TIMESTAMP;
        RAISE NOTICE 'Added diagnoses.deleted_at';
    END IF;

    -- updated_at (обновляется UPDATE-триггерами; дефолт = now для существующих строк)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='diagnoses' AND column_name='updated_at') THEN
        ALTER TABLE diagnoses ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added diagnoses.updated_at';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diagnoses_deleted_at ON diagnoses (deleted_at);
CREATE INDEX IF NOT EXISTS idx_diagnoses_is_active  ON diagnoses (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_diagnoses_name       ON diagnoses (name);


-- =====================================================
-- 3. Комментарии (документация в БД)
-- =====================================================
COMMENT ON COLUMN exercises.body_region      IS 'Регион тела: shoulder, knee, spine, hip, etc. (заменяет устаревшие category + body_part)';
COMMENT ON COLUMN exercises.difficulty_level IS 'Сложность 1-5 (1=beginner, 3=intermediate, 5=advanced)';
COMMENT ON COLUMN exercises.movement_pattern IS 'Паттерн движения: squat, hinge, push, pull, carry, rotate';
COMMENT ON COLUMN exercises.chain_type       IS 'open/closed kinetic chain';
COMMENT ON COLUMN exercises.joint            IS 'Основной сустав упражнения';
COMMENT ON COLUMN exercises.is_unilateral    IS 'Одностороннее упражнение (одна конечность за раз)';
COMMENT ON COLUMN diagnoses.deleted_at       IS 'Soft delete timestamp — NULL = активный';
COMMENT ON COLUMN diagnoses.updated_at       IS 'Timestamp последнего изменения';
