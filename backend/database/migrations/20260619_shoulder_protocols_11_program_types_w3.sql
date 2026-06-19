-- 2026-06-19: program_types — 3 типа Волны 3 (консервативные протоколы плеча).
-- Shoulder protocols, Волна 3. Только справочник типов; контент фаз + критерии — _12/_13/_14.
-- Предыдущие типы плеча/колена/acl и shoulder_general НЕ трогаем.
-- surgery_required=FALSE (все консервативные — операции нет); joint='shoulder'; body_side_relevant=TRUE.
-- Идемпотентна: ON CONFLICT (code) DO NOTHING.

BEGIN;

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('shoulder_subacromial_pain_conservative', 'Субакромиальный болевой синдром (консервативно)',         'shoulder', FALSE, 26),
  ('shoulder_calcific',                       'Кальцифицирующий тендинит манжеты (консервативно)',      'shoulder', FALSE, 27),
  ('shoulder_rc_conservative',                'Тендинопатия / частичный разрыв манжеты (консервативно)', 'shoulder', FALSE, 28)
ON CONFLICT (code) DO NOTHING;

COMMIT;
