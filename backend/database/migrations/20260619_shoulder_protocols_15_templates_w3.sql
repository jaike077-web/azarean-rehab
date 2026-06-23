-- 2026-06-19: program_templates — 3 карточки-шаблона Волны 3 (консервативные протоколы плеча).
-- Для шага «1. Шаблон» в RehabProgramModal/CreateWizard, группировка по суставу «Плечо».
-- FK program_templates.program_type → program_types(code): типы создаёт _11_program_types_w3.
-- Номер _15 (> _11) гарантирует порядок: типы → шаблоны.
-- default_phase_count/surgery_required зеркалят program_types. Источник истины после деплоя — AdminContent.
-- Идемпотентна: ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_shoulder_subacromial_pain_conservative', 'shoulder_subacromial_pain_conservative', 'Субакромиальный болевой синдром', 'Консервативная программа при субакромиальном болевом синдроме плеча (без операции). 4 фазы.',                  FALSE, 4, 26),
  ('tpl_shoulder_calcific',                       'shoulder_calcific',                       'Кальцифицирующий тендинит',      'Консервативная программа при кальцифицирующем тендините манжеты. 5 фаз (фаза 0 — только после процедуры барботажа/промывания).', FALSE, 5, 27),
  ('tpl_shoulder_rc_conservative',                'shoulder_rc_conservative',                'Тендинопатия манжеты',           'Консервативная программа при тендинопатии / частичном разрыве ротаторной манжеты. 4 фазы.',                    FALSE, 4, 28)
ON CONFLICT (code) DO NOTHING;

COMMIT;
