-- Seed: типы реабилитационных программ
-- Минимальный набор для Wave 1, расширяется через AdminContent UI (коммит 1.05).
-- Используется при пересоздании БД без миграций.

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('acl', 'ПКС реабилитация', 'knee', TRUE, 1),
  ('knee_general', 'Реабилитация колена', 'knee', FALSE, 2),
  ('shoulder_general', 'Реабилитация плеча', 'shoulder', FALSE, 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  joint = EXCLUDED.joint,
  surgery_required = EXCLUDED.surgery_required,
  position = EXCLUDED.position,
  updated_at = NOW();
