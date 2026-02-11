-- =====================================================
-- МИГРАЦИЯ: Добавить колонку title в complexes
-- Дата: 2026-02-11
-- Причина: endpoint GET /my/exercises использует c.title,
--          но колонка отсутствовала в исходной схеме
-- =====================================================

ALTER TABLE complexes ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Заполняем title для существующих комплексов (если есть)
UPDATE complexes SET title = 'Комплекс упражнений' WHERE title IS NULL;
