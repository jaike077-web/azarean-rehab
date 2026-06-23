-- 2026-06-19: program_types — 4 новых типа программ по швам ротаторной манжеты плеча.
-- Shoulder protocols, Волна 1 (швы манжеты). Коммит S0.
--
-- Источник: 4 доказательных досье (PROTOCOLS/shoulder/*.md) + PROTOCOLS/shoulder/_extractions.json.
-- Это ТОЛЬКО справочник типов. Контент фаз + критерии — отдельными миграциями (_02.._05).
-- `shoulder_general` уже есть на проде (миграция 20260512) — НЕ трогаем.
--
-- Решения (Vadim 2026-06-18): 4 раздельных протокола по сухожилиям/типу разрыва
-- (надостная / подостная / подлопаточная / массивный) — НЕ объединять. Сборка волнами;
-- это Волна 1. Декомпрессия, баллон и консервативные — следующие волны.
--
-- surgery_required=TRUE для всех 4 — инхерентно послеоперационные (шов сухожилия).
-- joint='shoulder' для всех; body_side_relevant=TRUE (дефолт — плечо левое/правое значимо).
--
-- Идемпотентна: ON CONFLICT (code) DO NOTHING — повторный прогон ничего не меняет,
-- ручные правки label/position через AdminContent сохраняются.

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('shoulder_rcr_supraspinatus', 'Шов надостной мышцы (ротаторная манжета)',     'shoulder', TRUE, 20),
  ('shoulder_rcr_infraspinatus', 'Шов подостной мышцы (ротаторная манжета)',     'shoulder', TRUE, 21),
  ('shoulder_rcr_subscapularis', 'Шов подлопаточной мышцы (ротаторная манжета)', 'shoulder', TRUE, 22),
  ('shoulder_rcr_massive',       'Шов массивного разрыва ротаторной манжеты',    'shoulder', TRUE, 23)
ON CONFLICT (code) DO NOTHING;

COMMIT;
