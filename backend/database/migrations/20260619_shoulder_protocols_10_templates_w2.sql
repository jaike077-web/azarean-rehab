-- 2026-06-19: program_templates — 2 карточки-шаблона Волны 2 (декомпрессия + баллон).
-- Для шага «1. Шаблон» в RehabProgramModal/CreateWizard, группировка по суставу «Плечо».
-- FK program_templates.program_type → program_types(code): типы создаёт _07_program_types_w2.
-- Номер _10 (> _07) гарантирует порядок: типы → шаблоны.
-- default_phase_count/surgery_required зеркалят program_types. Тексты — рабочая версия,
-- источник истины после деплоя — AdminContent. Идемпотентна: ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_shoulder_subacromial_decompression', 'shoulder_subacromial_decompression', 'Субакромиальная декомпрессия', 'Восстановление после артроскопической субакромиальной декомпрессии (акромиопластики). 4 фазы. Ветки А (без шва) / Б (с частичным швом) задаются режимом.', TRUE, 4, 24),
  ('tpl_shoulder_balloon',                    'shoulder_balloon',                    'Баллонный спейсер плеча',     'Восстановление после установки субакромиального баллонного спейсера при неоперабельном массивном разрыве манжеты. 5 фаз.',                                  TRUE, 5, 25)
ON CONFLICT (code) DO NOTHING;

COMMIT;
