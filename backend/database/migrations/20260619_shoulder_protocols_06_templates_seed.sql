-- 2026-06-19: program_templates — 4 карточки-шаблона для wizard'а (швы манжеты плеча, Волна 1).
-- Shoulder protocols, follow-up к _01.._05.
--
-- ЗАЧЕМ: на шаге «1. Шаблон» в RehabProgramModal (CreateWizard) показываются строки
-- program_templates. Эта миграция заводит по одной карточке-шаблону на каждый из 4 протоколов
-- швов манжеты (shoulder_rcr_*), чтобы инструктор выбирал протокол на шаге 1. Группировка по
-- суставу (program_joint='shoulder') разводит их в визарде под заголовок «Плечо».
--
-- ЗАВИСИМОСТЬ: шаблоны через FK program_templates.program_type → program_types(code) ссылаются
-- на типы shoulder_rcr_*. Эти типы создаёт миграция 20260619_shoulder_protocols_01_program_types.
-- Номер _06 в имени гарантирует порядок (после _01 program_types): сначала типы → потом шаблоны.
-- (Без числового суффикса «program_templates» сортировалось бы ПЕРЕД «protocols» и FK падал бы.)
--
-- ШАБЛОН ПОКА ПРЕФИЛЛИТ ТОЛЬКО «ТИП + НАЗВАНИЕ»: рекомендованных комплексов по фазам
-- (program_template_phase_complexes) нет — для плеча complex-шаблоны ещё не заведены.
-- Превью «что войдёт» в wizard'е будет пустым; это by design на старте.
--
-- default_phase_count / surgery_required зеркалят program_types (снимок на 2026-06-19).
-- Тексты title/description — рабочая версия; источник истины после деплоя — AdminContent
-- (вкладка «Шаблоны программ»).
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING. Ручные правки названий/позиций через AdminContent
-- сохраняются при re-run. НЕ трогает существующие knee/acl-шаблоны.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_shoulder_rcr_supraspinatus', 'shoulder_rcr_supraspinatus', 'Шов надостной мышцы',      'Послеоперационное восстановление после шва надостной мышцы ротаторной манжеты плеча. 5 фаз.',                 TRUE, 5, 20),
  ('tpl_shoulder_rcr_infraspinatus', 'shoulder_rcr_infraspinatus', 'Шов подостной мышцы',      'Послеоперационное восстановление после шва подостной мышцы ротаторной манжеты плеча. 5 фаз.',                 TRUE, 5, 21),
  ('tpl_shoulder_rcr_subscapularis', 'shoulder_rcr_subscapularis', 'Шов подлопаточной мышцы',  'Послеоперационное восстановление после изолированного шва подлопаточной мышцы плеча. 5 фаз.',                 TRUE, 5, 22),
  ('tpl_shoulder_rcr_massive',       'shoulder_rcr_massive',       'Массивный разрыв манжеты', 'Послеоперационное восстановление после шва массивного (комбинированного) разрыва ротаторной манжеты. 7 фаз.', TRUE, 7, 23)
ON CONFLICT (code) DO NOTHING;

COMMIT;
