-- 2026-06-03: program_templates — 10 шаблонов-карточек для wizard'а создания программы.
-- Knee protocols, follow-up к S0-S9 (TZ_PATIENT_PATH_KNEE_PROTOCOLS.md).
--
-- ЗАЧЕМ: на шаге «1. Шаблон» в RehabProgramModal (CreateWizard) показываются строки
-- program_templates. До этой миграции там был 1 шаблон ('acl_rehab' — «ПКС: острая фаза»),
-- хотя протоколов уже 10. Эта миграция заводит по одной карточке-шаблону на каждый из
-- 10 протоколов колена (acl + 9 knee_*), чтобы инструктор выбирал протокол на шаге 1.
--
-- ЗАВИСИМОСТЬ: шаблоны через FK program_templates.program_type → program_types(code)
-- ссылаются на типы knee_*. Эти типы создаются миграцией 20260601_knee_protocols_01.
-- Имя файла (20260603 > 20260601) гарантирует порядок: типы → потом шаблоны. На пустой
-- prod без knee-типов миграция упала бы на FK — поэтому едет ВМЕСТЕ с knee-протоколами.
--
-- ШАБЛОН ПОКА ПРЕФИЛЛИТ ТОЛЬКО «ТИП + НАЗВАНИЕ»: рекомендованных комплексов по фазам
-- (program_template_phase_complexes) нет — для колена ещё не заведены complex-шаблоны.
-- Превью «что войдёт» в wizard'е будет пустым; это by design на старте.
--
-- default_phase_count / surgery_required зеркалят program_types (снимок на 2026-06-03).
-- Тексты title/description — рабочая версия (как и фазы); источник истины после деплоя
-- — AdminContent (вкладка «Шаблоны программ»).
--
-- Старый 'acl_rehab' («ПКС: острая фаза», фаза-специфичный) деактивируется — новый
-- протокол-уровневый 'tpl_acl' его заменяет, чтобы на шаге 1 было ровно 10 чистых карточек.
-- Реверсивно: UPDATE program_templates SET is_active=true WHERE code='acl_rehab'.
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING для вставок + идемпотентный UPDATE
-- деактивации. Ручные правки названий/позиций через AdminContent сохраняются при re-run.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_acl',                            'acl',                            'ПКС (реконструкция связки)',           'Послеоперационное восстановление после реконструкции ПКС. 7 фаз.',          TRUE,  7, 1),
  ('tpl_knee_tka',                       'knee_tka',                       'Эндопротезирование колена',            'Восстановление после эндопротезирования коленного сустава. 3 фазы.',        TRUE,  3, 2),
  ('tpl_knee_pcl',                       'knee_pcl',                       'ЗКС (задняя крестообразная связка)',   'Восстановление при повреждении задней крестообразной связки. 4 фазы.',      FALSE, 4, 3),
  ('tpl_knee_extensor_mechanism_repair', 'knee_extensor_mechanism_repair', 'Разрыв разгибательного аппарата',      'Послеоперационное восстановление разгибательного аппарата колена. 5 фаз.',  TRUE,  5, 4),
  ('tpl_knee_osteotomy_hto_dfo',         'knee_osteotomy_hto_dfo',         'Корригирующая остеотомия (HTO/DFO)',   'Восстановление после корригирующей остеотомии (HTO/DFO). 5 фаз.',           TRUE,  5, 5),
  ('tpl_knee_cartilage_repair',          'knee_cartilage_repair',          'Восстановление хряща',                 'Восстановление после операции на хряще коленного сустава. 4 фазы.',         TRUE,  4, 6),
  ('tpl_knee_oa',                        'knee_oa',                        'Гонартроз (артроз колена)',            'Консервативная программа при гонартрозе (артрозе колена). 3 фазы.',         FALSE, 3, 7),
  ('tpl_knee_patellar_tendinopathy',     'knee_patellar_tendinopathy',     'Тендинопатия надколенника',            'Консервативная программа при тендинопатии надколенника. 5 фаз.',            FALSE, 5, 8),
  ('tpl_knee_pfps',                      'knee_pfps',                      'Пателлофеморальный синдром (ПФБС)',    'Консервативная программа при пателлофеморальном болевом синдроме. 3 фазы.', FALSE, 3, 9),
  ('tpl_knee_itbs',                      'knee_itbs',                      'Синдром илиотибиального тракта',       'Консервативная программа при синдроме илиотибиального тракта. 3 фазы.',     FALSE, 3, 10)
ON CONFLICT (code) DO NOTHING;

-- Деактивируем старый фаза-специфичный шаблон (заменён протокол-уровневым tpl_acl).
-- На dev/test (где acl_rehab нет) — no-op (0 строк). На проде — флип is_active.
UPDATE program_templates
   SET is_active = FALSE, updated_at = NOW()
 WHERE code = 'acl_rehab' AND is_active = TRUE;

COMMIT;
