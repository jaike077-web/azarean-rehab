-- 2026-06-01: program_types — 9 новых типов программ по патологиям колена.
-- Knee protocols, коммит S0 (ТЗ TZ_PATIENT_PATH_KNEE_PROTOCOLS.md §7).
--
-- Источник: 10 доказательных досье (PROTOCOLS/*.md, дип-ресёрч под экспертную калибровку).
-- Это ТОЛЬКО справочник типов. Контент фаз + критерии — отдельными миграциями (S1+).
-- `acl` уже есть на проде (миграция 20260512) — НЕ трогаем.
--
-- Решения (подтверждены Vadim 2026-06-01): 10 program_types на старте; ПКС/ЗКС — один тип
-- с модификатором (хирург/консерватив), консервативные ПКС/ЗКС и дробление хряща — отложены.
--
-- surgery_required=TRUE только для инхерентно послеоперационных (эндопротез, реконструкция
-- разгиб. аппарата, остеотомия, восстановление хряща). Консервативные/опциональные = FALSE.
-- joint='knee' для всех; body_side_relevant=TRUE (дефолт — колено левое/правое значимо).
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING — повторный прогон ничего не меняет,
-- ручные правки label/position через AdminContent сохраняются.

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('knee_oa',                       'Гонартроз (артроз колена)',                'knee', FALSE, 4),
  ('knee_tka',                      'Эндопротезирование колена',                'knee', TRUE,  5),
  ('knee_pcl',                      'ЗКС (задняя крестообразная связка)',       'knee', FALSE, 6),
  ('knee_extensor_mechanism_repair','Разрыв разгибательного аппарата колена',   'knee', TRUE,  7),
  ('knee_osteotomy_hto_dfo',        'Корригирующая остеотомия колена',          'knee', TRUE,  8),
  ('knee_cartilage_repair',         'Восстановление хряща колена',              'knee', TRUE,  9),
  ('knee_patellar_tendinopathy',    'Тендинопатия надколенника',                'knee', FALSE, 10),
  ('knee_pfps',                     'Пателлофеморальный болевой синдром',       'knee', FALSE, 11),
  ('knee_itbs',                     'Синдром илиотибиального тракта',           'knee', FALSE, 12)
ON CONFLICT (code) DO NOTHING;

COMMIT;
