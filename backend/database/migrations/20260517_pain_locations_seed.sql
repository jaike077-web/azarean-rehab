-- Wave 2 коммит 2.02 — seed pain_locations
-- 16 локаций (8 knee + 8 shoulder), 2 red-flag (calf_posterior DVT, neck_lateral radiculopathy)
-- Идемпотентно: ON CONFLICT DO NOTHING — повторный запуск безопасен, не перетирает ручные правки.
-- После initial seed Vadim — источник истины через AdminContent → PainLocationsTab.

BEGIN;

-- ================================================================
-- KNEE (program_type='acl' — verify-step 2026-05-16 подтвердил код)
-- ================================================================

INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason)
VALUES
  ('knee_anterior',           'acl', 'Передняя поверхность колена',                      10, FALSE, NULL),
  ('knee_posterior',          'acl', 'Задняя поверхность колена (подколенная ямка)',     20, FALSE, NULL),
  ('knee_medial',             'acl', 'Внутренняя поверхность колена',                    30, FALSE, NULL),
  ('knee_lateral',            'acl', 'Наружная поверхность колена',                      40, FALSE, NULL),
  ('knee_inferior_patellar',  'acl', 'Под надколенником (нижний полюс)',                 50, FALSE, NULL),
  ('knee_superior_patellar',  'acl', 'Над надколенником (сухожилие квадрицепса)',        60, FALSE, NULL),
  ('tibia_anterior',          'acl', 'Передняя поверхность голени',                      70, FALSE, NULL),
  ('calf_posterior',          'acl', 'Икроножная мышца (задняя поверхность голени)',     80, TRUE,
   'Возможный тромбоз глубоких вен (ТГВ). Срочно консультация куратора, ультразвук вен.')
ON CONFLICT (code) DO NOTHING;

-- ================================================================
-- SHOULDER (program_type='shoulder_general' — verify-step подтверждает код)
-- ================================================================

INSERT INTO pain_locations (code, program_type, label, position, is_red_flag, red_flag_reason)
VALUES
  ('shoulder_anterior',  'shoulder_general', 'Передняя поверхность плеча',                              10, FALSE, NULL),
  ('shoulder_lateral',   'shoulder_general', 'Боковая поверхность плеча (область дельтовидной мышцы)',  20, FALSE, NULL),
  ('shoulder_posterior', 'shoulder_general', 'Задняя поверхность плеча',                                30, FALSE, NULL),
  ('shoulder_superior',  'shoulder_general', 'Верхушка плеча (область надостной мышцы)',                40, FALSE, NULL),
  ('arm_anterior',       'shoulder_general', 'Передняя поверхность плечевой кости (бицепс)',            50, FALSE, NULL),
  ('arm_posterior',      'shoulder_general', 'Задняя поверхность плечевой кости (трицепс)',             60, FALSE, NULL),
  ('neck_lateral',       'shoulder_general', 'Боковая поверхность шеи',                                 70, TRUE,
   'Возможная цервикальная радикулопатия. Срочно консультация куратора, неврологический осмотр.'),
  ('scapula_medial',     'shoulder_general', 'Внутренний край лопатки',                                 80, FALSE, NULL)
ON CONFLICT (code) DO NOTHING;

COMMIT;
