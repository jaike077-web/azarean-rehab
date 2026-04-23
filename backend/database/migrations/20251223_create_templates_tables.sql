-- =====================================================
-- Migration: создать таблицы templates + template_exercises
-- Дата: 2025-12-23 (до 20251224_add_rest_seconds.sql)
-- -----------------------------------------------------
-- Причина: таблицы были созданы вручную на dev-окружении задолго
-- до появления нумерованных миграций. На чистой установке (prod)
-- их не существовало → 20251224_add_rest_seconds.sql падала с
-- `relation "template_exercises" does not exist`.
--
-- Схема 1:1 с dev-БД (снято через \d templates, \d template_exercises
-- 2026-04-23). CREATE IF NOT EXISTS — идемпотентно для dev.
-- =====================================================

CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    diagnosis_id INTEGER REFERENCES diagnoses(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_diagnosis  ON templates(diagnosis_id);

CREATE TABLE IF NOT EXISTS template_exercises (
    id SERIAL PRIMARY KEY,
    template_id      INTEGER REFERENCES templates(id) ON DELETE CASCADE,
    exercise_id      INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
    order_number     INTEGER NOT NULL,
    sets             INTEGER DEFAULT 3,
    reps             INTEGER DEFAULT 10,
    duration_seconds INTEGER,
    notes            TEXT
    -- rest_seconds добавляется следующей миграцией (20251224_add_rest_seconds.sql)
);

CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id);
