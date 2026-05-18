-- Wave 2 коммит 2.03 — ACL default phase transition criteria seed
-- ~30 критериев распределены по 6 фазам ПКС (Защита → Полное восстановление).
-- Источник: AAOS/APTA guidelines (Claude initial draft). Vadim ревьюит и калибрует через UI.
-- Идемпотентно: ON CONFLICT (phase_id, criterion_code) DO NOTHING — повторный запуск безопасен.

BEGIN;

WITH criteria_data (
  phase_number, criterion_code, label, criterion_type,
  measurement_type, measurement_source,
  threshold_operator, threshold_value, threshold_value2,
  staleness_days,
  self_report_question, self_report_hint,
  position, is_required
) AS (VALUES
  -- ============================================================
  -- Phase 1: Защита и контроль воспаления (0-2 недели)
  -- Цель: контроль отёка, восстановление полного разгибания
  -- ============================================================
  (1, 'full_extension',      'Полное активное разгибание колена (0°)',           'measurement',      'knee_extension_degrees', 'rom',  '=',  0::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  10::smallint, TRUE),
  (1, 'pain_at_rest_low',    'Боль в покое ≤ 3 по ВАШ',                          'measurement',      'vas_score',              'pain', '<=', 3::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  20::smallint, TRUE),
  (1, 'no_extension_lag',    'Отсутствует extension lag (квадрицепс работает)',  'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  30::smallint, TRUE),
  (1, 'effusion_controlled', 'Отёк сустава контролируется',                      'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  40::smallint, TRUE),
  (1, 'pwb_ambulation',      'Передвигаюсь на костылях с частичной опорой',      'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, 'Можете передвигаться на костылях с частичной нагрузкой?',     'Попробуйте несколько шагов по комнате',               50::smallint, TRUE),

  -- ============================================================
  -- Phase 2: Восстановление подвижности (2-6 недель)
  -- Цель: ROM ≥ 90°, отказ от костылей, ходьба без хромоты
  -- ============================================================
  (2, 'flexion_90',          'Сгибание ≥ 90°',                                   'measurement',      'knee_flexion_degrees',   'rom',  '>=', 90::numeric,  NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  10::smallint, TRUE),
  (2, 'extension_maintained','Полное разгибание сохраняется (0°)',               'measurement',      'knee_extension_degrees', 'rom',  '=',  0::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  20::smallint, TRUE),
  (2, 'pain_activity_low',   'Боль при активности ≤ 2 по ВАШ',                   'measurement',      'vas_score',              'pain', '<=', 2::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  30::smallint, TRUE),
  (2, 'walk_no_limp',        'Хожу без хромоты',                                 'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, 'Можете пройти 100 метров без хромоты?',                       'Пройдитесь по комнате, не подволакивая ногу',         40::smallint, TRUE),
  (2, 'effusion_minimal',    'Минимальный отёк сустава',                         'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  50::smallint, TRUE),

  -- ============================================================
  -- Phase 3: Укрепление мышц (6-12 недель)
  -- Цель: ROM ≥ 120°, одноногая стойка, отсутствие отёка
  -- ============================================================
  (3, 'flexion_120',         'Сгибание ≥ 120°',                                  'measurement',      'knee_flexion_degrees',   'rom',  '>=', 120::numeric, NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  10::smallint, TRUE),
  (3, 'single_leg_balance',  'Одноногая стойка ≥ 30 сек на оперированной ноге',  'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  20::smallint, TRUE),
  (3, 'stairs_normal',       'Поднимаюсь по лестнице нормальным шагом',          'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, 'Можете подняться на 1 этаж нормальным шагом?',                'Попробуйте подняться без перил',                      30::smallint, TRUE),
  (3, 'no_effusion',         'Отёк отсутствует',                                 'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  40::smallint, TRUE),
  (3, 'pain_min_activity',   'Боль при бытовой активности ≤ 1 по ВАШ',           'measurement',      'vas_score',              'pain', '<=', 1::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  50::smallint, TRUE),

  -- ============================================================
  -- Phase 4: Функциональная активность (3-6 месяцев)
  -- Цель: полный ROM, симметрия, начало динамических движений
  -- ============================================================
  (4, 'flexion_135',         'Сгибание ≥ 135° (полный ROM)',                     'measurement',      'knee_flexion_degrees',   'rom',  '>=', 135::numeric, NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  10::smallint, TRUE),
  (4, 'single_leg_squat',    'Одноногое приседание до 60° без боли',             'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, 'Можете присесть на оперированной ноге до 60° без боли?',      'Опирайтесь рукой о стену для безопасности',           20::smallint, TRUE),
  (4, 'bilateral_squat_sym', 'Двуногое приседание без видимой асимметрии',       'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  30::smallint, TRUE),
  (4, 'pain_zero_rest',      'Боль в покое отсутствует (0 по ВАШ)',              'measurement',      'vas_score',              'pain', '=',  0::numeric,   NULL::numeric,  7::smallint, NULL,                                                          NULL,                                                  40::smallint, TRUE),
  (4, 'jump_landing_ok',     'Прыжки и приземление с правильной механикой',     'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint, NULL,                                                          NULL,                                                  50::smallint, TRUE),

  -- ============================================================
  -- Phase 5: Возврат к спорту (4-6 месяцев)
  -- Цель: LSI ≥ 90%, спортивно-специфические движения, return-to-sport assessment
  -- ============================================================
  (5, 'single_hop_lsi',      'Single-leg hop test LSI ≥ 90%',                    'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           14::smallint, NULL,                                                         NULL,                                                  10::smallint, TRUE),
  (5, 'triple_hop_lsi',      'Triple-hop test LSI ≥ 90%',                        'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           14::smallint, NULL,                                                         NULL,                                                  20::smallint, TRUE),
  (5, 'sport_pain_free',     'Спортивно-специфические движения без боли',        'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint,  'Выполняете движения вашего спорта без боли?',                'Резкие повороты, остановки, ускорения',               30::smallint, TRUE),
  (5, 'no_swelling_after',   'Отсутствие отёка после высокоинтенсивной нагрузки','instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           7::smallint,  NULL,                                                         NULL,                                                  40::smallint, TRUE),
  (5, 'psych_readiness',     'Психологическая готовность к возврату в спорт',    'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           14::smallint, NULL,                                                         NULL,                                                  50::smallint, TRUE),

  -- ============================================================
  -- Phase 6: Полное восстановление (6+ месяцев)
  -- Цель: поддержание полного ROM, отсутствие симптомов, compliance
  -- ============================================================
  (6, 'rom_maintained',      'Полный ROM сохраняется (≥ 135°)',                  'measurement',      'knee_flexion_degrees',   'rom',  '>=', 135::numeric, NULL::numeric,  14::smallint, NULL,                                                         NULL,                                                  10::smallint, TRUE),
  (6, 'pain_absent',         'Боль отсутствует',                                 'measurement',      'vas_score',              'pain', '=',  0::numeric,   NULL::numeric,  14::smallint, NULL,                                                         NULL,                                                  20::smallint, TRUE),
  (6, 'home_compliance',     'Регулярно выполняю поддерживающие упражнения',     'self_report',      NULL,                     NULL,   NULL, NULL,         NULL,           14::smallint, 'Выполняете поддерживающие упражнения хотя бы 3 раза в неделю?', 'Без compliance высок риск re-injury',               30::smallint, TRUE),
  (6, 'no_reinjury_signs',   'Отсутствие признаков повторной травмы',            'instructor_check', NULL,                     NULL,   NULL, NULL,         NULL,           14::smallint, NULL,                                                         NULL,                                                  40::smallint, TRUE)
)
INSERT INTO phase_transition_criteria (
  phase_id, criterion_code, label, criterion_type,
  measurement_type, measurement_source,
  threshold_operator, threshold_value, threshold_value2, staleness_days,
  self_report_question, self_report_hint,
  position, is_required, is_active
)
SELECT
  p.id, cd.criterion_code, cd.label, cd.criterion_type,
  cd.measurement_type, cd.measurement_source,
  cd.threshold_operator, cd.threshold_value, cd.threshold_value2, cd.staleness_days,
  cd.self_report_question, cd.self_report_hint,
  cd.position, cd.is_required, TRUE
FROM criteria_data cd
JOIN rehab_phases p ON p.program_type = 'acl' AND p.phase_number = cd.phase_number
ON CONFLICT (phase_id, criterion_code) DO NOTHING;

COMMIT;
