-- 2026-05-12: справочник program_types + поле rehab_programs.program_type
-- Wave 1, коммит 1.01 — фундамент multi-protocol.
--
-- Сейчас rehab_programs не имеет поля program_type. Тип программы определяется
-- ad hoc regex'ом по diagnosis (Wave 0 коммит #02 — временное решение).
-- rehab_phases.program_type существует, но всегда 'acl' в seed.
--
-- Эта миграция вводит справочник program_types (минимальный seed) и добавляет
-- поле rehab_programs.program_type с FK. Без функциональных изменений UI —
-- использование program_type в backend/frontend происходит в коммитах 1.02-1.04.
--
-- Идемпотентна: повторный прогон ничего не меняет.

BEGIN;

-- 1. Справочник типов реабилитационных программ
CREATE TABLE IF NOT EXISTS program_types (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  joint VARCHAR(50),
  body_side_relevant BOOLEAN DEFAULT TRUE,
  surgery_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  position SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_types_joint ON program_types(joint);
CREATE INDEX IF NOT EXISTS idx_program_types_active ON program_types(is_active);

-- 2. Поле program_type на rehab_programs (с дефолтом 'acl' для обратной совместимости)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rehab_programs' AND column_name = 'program_type'
  ) THEN
    ALTER TABLE rehab_programs
      ADD COLUMN program_type VARCHAR(50) NOT NULL DEFAULT 'acl';
  END IF;
END $$;

-- 3. Минимальный seed program_types
INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('acl', 'ПКС реабилитация', 'knee', TRUE, 1),
  ('knee_general', 'Реабилитация колена', 'knee', FALSE, 2),
  ('shoulder_general', 'Реабилитация плеча', 'shoulder', FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- 4. FK на program_types (после seed, иначе FK не создастся при пустой program_types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rehab_programs' AND constraint_name = 'fk_rehab_programs_program_type'
  ) THEN
    ALTER TABLE rehab_programs
      ADD CONSTRAINT fk_rehab_programs_program_type
      FOREIGN KEY (program_type) REFERENCES program_types(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Backfill для существующих программ — если diagnosis содержит маркер плеча,
-- меняем program_type с дефолтного 'acl' на 'shoulder_general'.
-- Статистика Vadim'а: 90% наших пациентов — колено, поэтому 'acl' остаётся дефолтом.
UPDATE rehab_programs
SET program_type = 'shoulder_general'
WHERE program_type = 'acl'
  AND diagnosis ~* '(плеч|shoulder|манжет|надостн|cuff|frozen)';

COMMIT;
