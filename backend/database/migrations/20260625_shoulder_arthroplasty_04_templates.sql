-- 2026-06-25: program_templates — 2 карточки-шаблона для wizard'а (эндопротезирование плеча).
-- Shoulder protocols, новая партия (артропластика), follow-up к _01.._03.
--
-- ЗАЧЕМ: на шаге «1. Шаблон» в RehabProgramModal показываются строки program_templates.
-- Эта миграция заводит по карточке на каждый из 2 протоколов эндопротезирования (shoulder_tsa /
-- shoulder_rsa). Группировка по суставу (program_joint='shoulder') разводит их под заголовок «Плечо».
--
-- ЗАВИСИМОСТЬ: шаблоны через FK program_templates.program_type → program_types(code) ссылаются на
-- типы shoulder_tsa / shoulder_rsa, которые создаёт миграция _01_program_types. Числовой суффикс
-- _04 гарантирует порядок (после _01): сначала типы → потом шаблоны. (Без числа «templates»
-- сортировалось бы ПЕРЕД «tsa»/«rsa» и FK падал бы.)
--
-- ШАБЛОН ПОКА ПРЕФИЛЛИТ ТОЛЬКО «ТИП + НАЗВАНИЕ»: рекомендованных комплексов по фазам
-- (program_template_phase_complexes) нет — для плеча complex-шаблоны ещё не заведены. Превью
-- «что войдёт» в wizard'е будет пустым; это by design на старте (как у манжеты и колена).
--
-- default_phase_count=5 (фазы 0..4) зеркалит program_types. surgery_required=TRUE.
-- Тексты title/description — рабочая версия; источник истины после деплоя — AdminContent.
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING. Ручные правки названий/позиций сохраняются.

BEGIN;

INSERT INTO program_templates
  (code, program_type, title, description, surgery_required, default_phase_count, position) VALUES
  ('tpl_shoulder_tsa', 'shoulder_tsa', 'Анатомическое эндопротезирование плеча', 'Послеоперационное восстановление после анатомической замены плечевого сустава. Защита шва подлопаточной мышцы. 5 фаз.', TRUE, 5, 30),
  ('tpl_shoulder_rsa', 'shoulder_rsa', 'Реверсивное эндопротезирование плеча',  'Послеоперационное восстановление после реверсивной замены плечевого сустава. Защита дельтовидной + анти-вывиховые предосторожности. 5 фаз.', TRUE, 5, 31)
ON CONFLICT (code) DO NOTHING;

COMMIT;
