-- 2026-06-22: полировка названий колено-протоколов (program_types.label = program_templates.title).
-- Приводит формулировки к корректному клиническому виду (Vadim, 2026-06-22):
--   - «Тендинопатия надколенника» → «...связки надколенника» (надколенник — кость, страдает связка);
--   - «ПКС реабилитация» → «Реконструкция передней крестообразной связки (ПКС)» (закрывает бэклог CLAUDE.md);
--   - аббревиатуры раскрыты / вынесены в скобки; добавлены понятные дескрипторы; label=title унифицированы.
-- Затрагивает 10 LIVE-типов колена (улучшение терминологии в проде) + новые мениск-типы.
-- Имя «_zz_» гарантирует порядок: после создания типов (knee_protocols_01, knee_meniscus_01) и шаблонов.
-- Идемпотентно: UPDATE по фиксированным значениям. Источник истины после деплоя — AdminContent.

BEGIN;

-- program_types.label
UPDATE program_types SET label = 'Реконструкция передней крестообразной связки (ПКС)' WHERE code = 'acl';
UPDATE program_types SET label = 'Колено — общая программа' WHERE code = 'knee_general';
UPDATE program_types SET label = 'Эндопротезирование коленного сустава' WHERE code = 'knee_tka';
UPDATE program_types SET label = 'Повреждение задней крестообразной связки (ЗКС)' WHERE code = 'knee_pcl';
UPDATE program_types SET label = 'Разрыв разгибательного аппарата колена' WHERE code = 'knee_extensor_mechanism_repair';
UPDATE program_types SET label = 'Корригирующая остеотомия (HTO/DFO)' WHERE code = 'knee_osteotomy_hto_dfo';
UPDATE program_types SET label = 'Восстановление хряща колена' WHERE code = 'knee_cartilage_repair';
UPDATE program_types SET label = 'Тендинопатия связки надколенника («колено прыгуна»)' WHERE code = 'knee_patellar_tendinopathy';
UPDATE program_types SET label = 'Пателлофеморальный болевой синдром (боль в передней части колена)' WHERE code = 'knee_pfps';
UPDATE program_types SET label = 'Синдром илиотибиального тракта (боль по наружной стороне колена)' WHERE code = 'knee_itbs';
UPDATE program_types SET label = 'Резекция мениска (частичное удаление)' WHERE code = 'knee_meniscectomy';
UPDATE program_types SET label = 'Трансплантация мениска' WHERE code = 'knee_meniscus_allograft';

-- program_templates.title (по тем же кодам; меню шаблонов = тот же канон)
UPDATE program_templates SET title = 'Реконструкция передней крестообразной связки (ПКС)' WHERE program_type = 'acl';
UPDATE program_templates SET title = 'Эндопротезирование коленного сустава' WHERE program_type = 'knee_tka';
UPDATE program_templates SET title = 'Повреждение задней крестообразной связки (ЗКС)' WHERE program_type = 'knee_pcl';
UPDATE program_templates SET title = 'Разрыв разгибательного аппарата колена' WHERE program_type = 'knee_extensor_mechanism_repair';
UPDATE program_templates SET title = 'Корригирующая остеотомия (HTO/DFO)' WHERE program_type = 'knee_osteotomy_hto_dfo';
UPDATE program_templates SET title = 'Восстановление хряща колена' WHERE program_type = 'knee_cartilage_repair';
UPDATE program_templates SET title = 'Тендинопатия связки надколенника («колено прыгуна»)' WHERE program_type = 'knee_patellar_tendinopathy';
UPDATE program_templates SET title = 'Пателлофеморальный болевой синдром (боль в передней части колена)' WHERE program_type = 'knee_pfps';
UPDATE program_templates SET title = 'Синдром илиотибиального тракта (боль по наружной стороне колена)' WHERE program_type = 'knee_itbs';
UPDATE program_templates SET title = 'Резекция мениска (частичное удаление)' WHERE program_type = 'knee_meniscectomy';
UPDATE program_templates SET title = 'Трансплантация мениска' WHERE program_type = 'knee_meniscus_allograft';

COMMIT;
