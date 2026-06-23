-- 2026-06-22: program_templates — 5 карточек-шаблонов для wizard'а (K1 мениск колена).
-- По карточке на каждый менисковый program_type (типы из 20260622_knee_meniscus_01).
-- Префиллит только тип+название (рекомендованных комплексов по фазам нет — by design).
-- Идемпотентна: ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_knee_meniscus_repair'          , 'knee_meniscus_repair'        , 'Шов мениска'                         , 'Послеоперационное восстановление: шов мениска. 6 фаз.', TRUE , 6, 11),
  ('tpl_knee_meniscus_root_repair'     , 'knee_meniscus_root_repair'   , 'Шов корня мениска'                   , 'Послеоперационное восстановление: шов корня мениска. 6 фаз.', TRUE , 6, 12),
  ('tpl_knee_meniscectomy'             , 'knee_meniscectomy'           , 'Резекция мениска'                    , 'Послеоперационное восстановление: резекция мениска. 3 фазы.', TRUE , 3, 13),
  ('tpl_knee_meniscus_conservative'    , 'knee_meniscus_conservative'  , 'Разрыв мениска (без операции)'       , 'Консервативная программа: разрыв мениска (без операции). 3 фазы.', FALSE, 3, 14),
  ('tpl_knee_meniscus_allograft'       , 'knee_meniscus_allograft'     , 'Пересадка мениска'                   , 'Послеоперационное восстановление: пересадка мениска. 6 фаз.', TRUE , 6, 15)
ON CONFLICT (code) DO NOTHING;

COMMIT;
