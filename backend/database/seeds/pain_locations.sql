-- Pain locations seed (dev convenience / документация)
-- АВТОРИТЕТНАЯ копия — backend/database/migrations/20260517_pain_locations_seed.sql
-- Этот файл — для ручного применения на dev (psql -f) или для clinical review.
-- При расхождениях миграция — источник истины.
-- 16 локаций: 8 knee (program_type='acl') + 8 shoulder (program_type='shoulder_general').
-- Two red-flag: calf_posterior (ТГВ), neck_lateral (цервикальная радикулопатия).

BEGIN;

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
