-- =====================================================
-- Миграция: exercises.description — убрать NOT NULL (2026-04-24b)
-- =====================================================
-- В schema.sql колонка `description TEXT NOT NULL`, но на dev БД
-- она давно nullable (тоже schema drift, как и в 20260424_prod_schema_recovery).
-- Kinescope-импорт пишет description=NULL если у видео нет описания
-- → на prod INSERT падал с "null value in column description violates
-- not-null constraint" → отменял транзакцию → все 229 видео ловили
-- каскадный "current transaction is aborted".
--
-- Идемпотентна: ALTER COLUMN ... DROP NOT NULL безопасна на повторном
-- прогоне (если уже nullable — no-op).
-- =====================================================

ALTER TABLE exercises ALTER COLUMN description DROP NOT NULL;

COMMENT ON COLUMN exercises.description IS 'Описание упражнения (nullable — Kinescope-видео могут импортироваться без описания)';
