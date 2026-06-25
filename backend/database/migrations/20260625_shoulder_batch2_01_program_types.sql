-- 2026-06-25: program_types — 13 типов новой плечевой партии (нестабильность, бицепс, переломы,
-- АКС, капсула/артроз, SLAP). Shoulder protocols, под-волны A2–A7 (после артропластики A1).
--
-- Источник: PROTOCOLS/shoulder/*.md + _extractions_newbatch.json (13 объектов).
-- Это ТОЛЬКО справочник типов. Контент фаз + критерии — отдельными миграциями (_02.._14).
-- Шаблоны-карточки — _15. Существующие типы (манжета, артропластика, shoulder_general) не тронуты.
--
-- Решения (Vadim 2026-06-22): группы — нестабильность / бицепс / переломы / АКС / капсула-артроз /
-- SLAP. Внутрихирургические варианты (тип фиксации, перенос сухожилий, школы) — модификаторы
-- в тексте фаз, НЕ отдельные типы. Коды shoulder_slap / shoulder_clavicle_orif / shoulder_frozen
-- присвоены нами (в досье кода не было) — приняты как есть (решение A).
--
-- surgery_required: TRUE для хирургических (latarjet, bankart, оба бицепса, phf_orif, ac_repair,
-- slap, clavicle_orif), FALSE для консервативных (instability/phf/ac _conservative, oa, frozen).
-- joint='shoulder'; body_side_relevant=TRUE (дефолт).
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING — ручные правки label/position сохраняются.

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  -- Нестабильность
  ('shoulder_latarjet',                'Операция Латарже (передняя нестабильность плеча)',          'shoulder', TRUE,  32),
  ('shoulder_bankart',                 'Шов Банкарта (стабилизация плеча)',                          'shoulder', TRUE,  33),
  ('shoulder_instability_conservative','Нестабильность плеча — консервативное ведение',              'shoulder', FALSE, 34),
  -- Бицепс
  ('shoulder_biceps_tenodesis',        'Тенодез длинной головки бицепса',                            'shoulder', TRUE,  35),
  ('shoulder_biceps_tenotomy',         'Тенотомия длинной головки бицепса',                          'shoulder', TRUE,  36),
  -- Переломы
  ('shoulder_phf_orif',                'Остеосинтез перелома плечевой кости (проксимальный отдел)',  'shoulder', TRUE,  37),
  ('shoulder_phf_conservative',        'Перелом плечевой кости (проксимальный отдел) — консервативно','shoulder', FALSE, 38),
  ('shoulder_clavicle_orif',           'Остеосинтез перелома ключицы',                               'shoulder', TRUE,  39),
  -- Акромиально-ключичное сочленение
  ('shoulder_ac_repair',               'Реконструкция акромиально-ключичного сочленения',            'shoulder', TRUE,  40),
  ('shoulder_ac_conservative',         'Травма акромиально-ключичного сочленения — консервативно',   'shoulder', FALSE, 41),
  -- Капсула / артроз
  ('shoulder_frozen',                  'Адгезивный капсулит («замороженное плечо»)',                 'shoulder', FALSE, 42),
  ('shoulder_oa',                      'Артроз плечевого сустава — консервативно',                   'shoulder', FALSE, 43),
  -- SLAP
  ('shoulder_slap',                    'Шов SLAP-повреждения (верхняя суставная губа)',              'shoulder', TRUE,  44)
ON CONFLICT (code) DO NOTHING;

COMMIT;
