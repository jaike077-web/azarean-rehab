-- 2026-06-19: program_types — 2 типа Волны 2 (прочая хирургия плеча: декомпрессия + баллон).
-- Shoulder protocols, Волна 2. Только справочник типов; контент фаз + критерии — _08/_09.
-- shoulder_general (20260512) и типы Волны 1 (_01) НЕ трогаем.
-- surgery_required=TRUE (оба послеоперационные); joint='shoulder'; body_side_relevant=TRUE (дефолт).
-- Идемпотентна: ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('shoulder_subacromial_decompression', 'Субакромиальная декомпрессия (акромиопластика)', 'shoulder', TRUE, 24),
  ('shoulder_balloon',                    'Субакромиальный баллонный спейсер',             'shoulder', TRUE, 25)
ON CONFLICT (code) DO NOTHING;

COMMIT;
