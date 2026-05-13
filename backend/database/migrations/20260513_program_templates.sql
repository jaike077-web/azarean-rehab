-- 2026-05-13: program_templates — преднабор «тип программы + рекомендованные комплексы по фазам»
-- Wave 1, коммит 1.06 — фундамент блока B (шаблоны программ).
--
-- Сейчас при создании RehabProgram инструктор верстает комплекс с нуля для каждого
-- нового пациента. Нет понятия «стандартный комплекс для ACL фазы 1». Templates
-- существуют для комплексов упражнений (с 20251223), но не связаны ни с program_type,
-- ни с фазами.
--
-- Эта миграция вводит:
-- 1. program_templates — шаблоны программ (например, «ПКС BPTB», «Меннисэктомия частичная»)
-- 2. program_template_phase_complexes — junction шаблон ↔ рекомендованные template'ы комплексов
-- 3. rehab_programs.program_template_id — tracking источника шаблона
-- 4. templates.program_type — фильтрация комплексов под тип программы
--
-- Без seed program_templates — Vadim наполняет через AdminContent UI (коммит 1.07).
-- Использование во фронте — RehabProgramModal wizard в коммите 1.08b.
--
-- Идемпотентна: повторный прогон ничего не меняет.

BEGIN;

-- 1. Шаблоны программ
CREATE TABLE IF NOT EXISTS program_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code) ON UPDATE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  surgery_required BOOLEAN DEFAULT FALSE,
  default_phase_count SMALLINT,
  variant_of INTEGER REFERENCES program_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  position SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_templates_type ON program_templates(program_type);
CREATE INDEX IF NOT EXISTS idx_program_templates_active ON program_templates(is_active);

-- 2. Junction: шаблон программы ↔ рекомендованные шаблоны комплексов на каждой фазе
CREATE TABLE IF NOT EXISTS program_template_phase_complexes (
  id SERIAL PRIMARY KEY,
  program_template_id INTEGER NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
  phase_number SMALLINT NOT NULL,
  complex_template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  is_recommended BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (program_template_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_pt_phase_complexes_template ON program_template_phase_complexes(program_template_id);

-- 3. rehab_programs.program_template_id — tracking какой шаблон использован
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rehab_programs' AND column_name = 'program_template_id'
  ) THEN
    ALTER TABLE rehab_programs
      ADD COLUMN program_template_id INTEGER REFERENCES program_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rehab_programs_template ON rehab_programs(program_template_id);

-- 4. templates.program_type — для фильтрации комплексов под тип программы
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'program_type'
  ) THEN
    ALTER TABLE templates
      ADD COLUMN program_type VARCHAR(50) REFERENCES program_types(code) ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_program_type ON templates(program_type);

COMMIT;
