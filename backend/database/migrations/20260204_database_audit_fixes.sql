-- =====================================================
-- МИГРАЦИЯ: Исправление проблем аудита БД
-- Дата: 2026-02-04
-- Версия: 2.3.0
-- Автор: postgres-pro agent
-- =====================================================

-- ВАЖНО! Сделайте резервную копию перед применением:
-- pg_dump -U postgres -d azarean_rehab -F c -f backup_before_audit_fixes.backup

BEGIN;

-- =====================================================
-- 1. ИНДЕКСЫ на is_active (критично для производительности)
-- =====================================================

-- exercises.is_active - используется в каждом SELECT
CREATE INDEX IF NOT EXISTS idx_exercises_is_active
ON exercises(is_active)
WHERE is_active = true;

-- patients.is_active - списки пациентов
CREATE INDEX IF NOT EXISTS idx_patients_is_active
ON patients(is_active)
WHERE is_active = true;

-- complexes.is_active - критично важно
CREATE INDEX IF NOT EXISTS idx_complexes_is_active
ON complexes(is_active)
WHERE is_active = true;

-- diagnoses.is_active - справочник
CREATE INDEX IF NOT EXISTS idx_diagnoses_is_active
ON diagnoses(is_active)
WHERE is_active = true;

-- =====================================================
-- 2. СОСТАВНЫЕ ИНДЕКСЫ для частых запросов
-- =====================================================

-- progress_logs: запросы с сортировкой по дате
CREATE INDEX IF NOT EXISTS idx_progress_logs_complex_completed
ON progress_logs(complex_id, completed_at DESC NULLS LAST);

-- progress_logs: запросы конкретного упражнения в комплексе
CREATE INDEX IF NOT EXISTS idx_progress_logs_complex_exercise
ON progress_logs(complex_id, exercise_id);

-- complexes: списки комплексов активного пациента
CREATE INDEX IF NOT EXISTS idx_complexes_patient_active
ON complexes(patient_id, is_active)
WHERE is_active = true;

-- complexes: комплексы инструктора (активные)
CREATE INDEX IF NOT EXISTS idx_complexes_instructor_active
ON complexes(instructor_id, is_active)
WHERE is_active = true;

-- patients: пациенты инструктора (активные)
CREATE INDEX IF NOT EXISTS idx_patients_created_active
ON patients(created_by, is_active)
WHERE is_active = true;

-- progress_logs: аналитика по сессиям
CREATE INDEX IF NOT EXISTS idx_progress_logs_session
ON progress_logs(session_id)
WHERE session_id IS NOT NULL;

-- =====================================================
-- 3. ИСПРАВЛЕНИЕ FOREIGN KEYS
-- =====================================================

-- exercises.created_by: добавляем ON DELETE SET NULL
ALTER TABLE exercises
DROP CONSTRAINT IF EXISTS exercises_created_by_fkey;

ALTER TABLE exercises
ADD CONSTRAINT exercises_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- =====================================================
-- 4. УДАЛЕНИЕ ИЗБЫТОЧНЫХ/УСТАРЕВШИХ ИНДЕКСОВ
-- =====================================================

-- Удаляем обычный индекс на access_token (UNIQUE constraint создаёт свой)
DROP INDEX IF EXISTS idx_complexes_token;

-- users.email уже имеет UNIQUE constraint (автоматический индекс)
DROP INDEX IF EXISTS idx_users_email;

-- Устаревшие индексы после миграции (поля переименованы)
DROP INDEX IF EXISTS idx_exercises_category;
DROP INDEX IF EXISTS idx_exercises_difficulty;

-- =====================================================
-- 5. ДОБАВЛЕНИЕ НЕДОСТАЮЩИХ ПОЛЕЙ (если не применена миграция)
-- =====================================================

-- exercises: проверяем и добавляем поля
DO $$
BEGIN
    -- short_title
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'short_title'
    ) THEN
        ALTER TABLE exercises ADD COLUMN short_title VARCHAR(100);
        RAISE NOTICE 'Добавлена колонка: exercises.short_title';
    END IF;

    -- exercise_type
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'exercise_type'
    ) THEN
        ALTER TABLE exercises ADD COLUMN exercise_type VARCHAR(50);
        RAISE NOTICE 'Добавлена колонка: exercises.exercise_type';
    END IF;

    -- cues
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'cues'
    ) THEN
        ALTER TABLE exercises ADD COLUMN cues TEXT;
        RAISE NOTICE 'Добавлена колонка: exercises.cues';
    END IF;

    -- absolute_contraindications
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'absolute_contraindications'
    ) THEN
        ALTER TABLE exercises ADD COLUMN absolute_contraindications TEXT;
        RAISE NOTICE 'Добавлена колонка: exercises.absolute_contraindications';
    END IF;

    -- red_flags
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'red_flags'
    ) THEN
        ALTER TABLE exercises ADD COLUMN red_flags TEXT;
        RAISE NOTICE 'Добавлена колонка: exercises.red_flags';
    END IF;

    -- safe_with_inflammation
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'safe_with_inflammation'
    ) THEN
        ALTER TABLE exercises ADD COLUMN safe_with_inflammation BOOLEAN DEFAULT false;
        RAISE NOTICE 'Добавлена колонка: exercises.safe_with_inflammation';
    END IF;

    -- Конвертируем equipment в JSONB если это VARCHAR
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'equipment'
        AND data_type != 'jsonb'
    ) THEN
        RAISE NOTICE 'Конвертируем exercises.equipment в JSONB...';
        ALTER TABLE exercises ALTER COLUMN equipment TYPE JSONB
        USING CASE
            WHEN equipment IS NULL OR equipment = '' THEN '[]'::jsonb
            ELSE jsonb_build_array(equipment)
        END;
    END IF;

    -- Добавляем position JSONB
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'position'
    ) THEN
        ALTER TABLE exercises ADD COLUMN position JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Добавлена колонка: exercises.position';
    ELSIF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'position'
        AND data_type != 'jsonb'
    ) THEN
        ALTER TABLE exercises ALTER COLUMN position TYPE JSONB
        USING CASE
            WHEN position IS NULL OR position = '' THEN '[]'::jsonb
            ELSE jsonb_build_array(position)
        END;
    END IF;

    -- Добавляем rehab_phases JSONB
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'exercises' AND column_name = 'rehab_phases'
    ) THEN
        ALTER TABLE exercises ADD COLUMN rehab_phases JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Добавлена колонка: exercises.rehab_phases';
    END IF;
END $$;

-- patients: добавляем diagnosis
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'diagnosis'
    ) THEN
        ALTER TABLE patients ADD COLUMN diagnosis TEXT;
        RAISE NOTICE 'Добавлена колонка: patients.diagnosis';
    END IF;
END $$;

-- =====================================================
-- 6. GIN ИНДЕКСЫ для JSONB полей
-- =====================================================

-- exercises.equipment (для быстрого поиска по оборудованию)
CREATE INDEX IF NOT EXISTS idx_exercises_equipment_gin
ON exercises USING GIN (equipment);

-- exercises.position (для фильтрации по положению тела)
CREATE INDEX IF NOT EXISTS idx_exercises_position_gin
ON exercises USING GIN (position);

-- exercises.rehab_phases (для фильтрации по фазам реабилитации)
CREATE INDEX IF NOT EXISTS idx_exercises_rehab_phases_gin
ON exercises USING GIN (rehab_phases);

-- audit_logs.details (для поиска по содержимому логов)
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin
ON audit_logs USING GIN (details);

-- =====================================================
-- 7. ОПТИМИЗАЦИЯ ТИПОВ ДАННЫХ
-- =====================================================

-- Изменяем INTEGER на SMALLINT для счетчиков (экономия памяти)
DO $$
BEGIN
    -- users.failed_login_attempts (0-5)
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'failed_login_attempts'
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE users
        ALTER COLUMN failed_login_attempts TYPE SMALLINT;
        RAISE NOTICE 'Оптимизирован тип: users.failed_login_attempts -> SMALLINT';
    END IF;

    -- progress_logs.pain_level (0-10)
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'progress_logs'
        AND column_name = 'pain_level'
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE progress_logs
        ALTER COLUMN pain_level TYPE SMALLINT;
        RAISE NOTICE 'Оптимизирован тип: progress_logs.pain_level -> SMALLINT';
    END IF;

    -- progress_logs.difficulty_rating (1-10)
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'progress_logs'
        AND column_name = 'difficulty_rating'
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE progress_logs
        ALTER COLUMN difficulty_rating TYPE SMALLINT;
        RAISE NOTICE 'Оптимизирован тип: progress_logs.difficulty_rating -> SMALLINT';
    END IF;
END $$;

-- =====================================================
-- 8. EMAIL VALIDATION CONSTRAINTS
-- =====================================================

-- users.email: валидация формата
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_format_check;
ALTER TABLE users ADD CONSTRAINT users_email_format_check
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- patients.email: валидация формата (может быть NULL)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_email_format_check;
ALTER TABLE patients ADD CONSTRAINT patients_email_format_check
CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- =====================================================
-- 9. КОММЕНТАРИИ К ТАБЛИЦАМ (документация)
-- =====================================================

COMMENT ON TABLE users IS 'Инструкторы и администраторы системы';
COMMENT ON TABLE patients IS 'Пациенты, проходящие реабилитацию';
COMMENT ON TABLE exercises IS 'Библиотека реабилитационных упражнений';
COMMENT ON TABLE complexes IS 'Персональные комплексы упражнений для пациентов';
COMMENT ON TABLE complex_exercises IS 'Связь комплексов и упражнений с параметрами выполнения';
COMMENT ON TABLE progress_logs IS 'Логи выполнения упражнений пациентами';
COMMENT ON TABLE diagnoses IS 'Справочник медицинских диагнозов';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh токены для продления сессий';
COMMENT ON TABLE audit_logs IS 'Журнал аудита доступа к персональным данным (152-ФЗ)';

-- Комментарии к важным колонкам
COMMENT ON COLUMN exercises.equipment IS 'JSONB массив оборудования: ["no-equipment", "resistance-band"]';
COMMENT ON COLUMN exercises.position IS 'JSONB массив положений тела: ["standing", "sitting", "lying"]';
COMMENT ON COLUMN exercises.rehab_phases IS 'JSONB массив фаз реабилитации';
COMMENT ON COLUMN exercises.kinescope_id IS 'ID видео в Kinescope для автоматического получения превью';
COMMENT ON COLUMN complexes.access_token IS 'Уникальный токен для доступа пациента без авторизации';
COMMENT ON COLUMN progress_logs.session_id IS 'ID тренировочной сессии (timestamp)';
COMMENT ON COLUMN users.failed_login_attempts IS 'Счетчик неудачных попыток входа (блокировка после 5)';
COMMENT ON COLUMN users.locked_until IS 'Время до которого аккаунт заблокирован';

-- =====================================================
-- 10. ОБНОВЛЕНИЕ СТАТИСТИКИ
-- =====================================================

ANALYZE users;
ANALYZE patients;
ANALYZE exercises;
ANALYZE complexes;
ANALYZE complex_exercises;
ANALYZE progress_logs;
ANALYZE diagnoses;
ANALYZE refresh_tokens;
ANALYZE audit_logs;

-- =====================================================
-- 11. ПРОВЕРКА РЕЗУЛЬТАТОВ
-- =====================================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    -- Проверяем количество индексов
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN ('exercises', 'complexes', 'progress_logs', 'patients', 'users');

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Создано/проверено индексов: %', index_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Следующие шаги:';
    RAISE NOTICE '1. Проверить индексы: SELECT * FROM pg_indexes WHERE schemaname = ''public'';';
    RAISE NOTICE '2. Проверить размер таблиц: SELECT pg_size_pretty(pg_total_relation_size(''exercises''));';
    RAISE NOTICE '3. Обновить schema.sql до актуального состояния';
    RAISE NOTICE '';
END $$;

COMMIT;

-- =====================================================
-- КАК ПРИМЕНИТЬ:
-- В pgAdmin: Query Tool -> Вставить этот SQL -> F5
-- Или: psql -U postgres -d azarean_rehab -f 20260204_database_audit_fixes.sql
-- =====================================================
