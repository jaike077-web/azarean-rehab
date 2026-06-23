-- 2026-06-22: program_types — 5 менисковых типов колена (K1).
-- Только справочник типов. Контент фаз + критерии — миграции 02–06. Карточки wizard — 07.
-- joint='knee', body_side_relevant=TRUE (дефолт). surgery_required=TRUE для хирургических
-- (шов/корень/резекция/пересадка), FALSE для консервативного разрыва.
-- Идемпотентна: ON CONFLICT (code) DO NOTHING (ручные правки через AdminContent сохраняются).

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('knee_meniscus_repair'            , 'Шов мениска'                           , 'knee', TRUE , 13),
  ('knee_meniscus_root_repair'       , 'Шов корня мениска'                     , 'knee', TRUE , 14),
  ('knee_meniscectomy'               , 'Резекция мениска'                      , 'knee', TRUE , 15),
  ('knee_meniscus_conservative'      , 'Разрыв мениска (без операции)'         , 'knee', FALSE, 16),
  ('knee_meniscus_allograft'         , 'Пересадка (трансплантация) мениска'    , 'knee', TRUE , 17)
ON CONFLICT (code) DO NOTHING;

COMMIT;
