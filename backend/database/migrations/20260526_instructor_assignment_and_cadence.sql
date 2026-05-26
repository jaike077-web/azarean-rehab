-- Wave 3 — C1: instructor assignment + complex cadence (foundation)
-- Аддитивно: ADD COLUMN x4 + индекс + бэкфилл + CHECK. Без изменения типов.
-- Идемпотентно (ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS перед ADD).
-- _migrations tracking — через deploy/migrate.sh (SHA-256 checksum), не здесь.

BEGIN;

-- 1. patients.assigned_instructor_id — текущий ответственный инструктор
--    (отдельно от created_by = «кто завёл»)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS assigned_instructor_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_assigned_instructor
  ON patients (assigned_instructor_id) WHERE is_active = true;

-- 2. Бэкфилл: последний активный комплекс пациента → его instructor_id,
--    иначе fallback на created_by. Только где ещё не проставлено (идемпотентно).
UPDATE patients p
SET assigned_instructor_id = COALESCE(
      (SELECT c.instructor_id
         FROM complexes c
        WHERE c.patient_id = p.id
          AND c.is_active = true
          AND c.instructor_id IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 1),
      p.created_by)
WHERE p.assigned_instructor_id IS NULL;

-- 3. complexes — целевая частота (диапазон + единица).
--    Все три NULL = «частота не задана» (legacy-комплексы и до заполнения формой).
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS target_min  SMALLINT,
  ADD COLUMN IF NOT EXISTS target_max  SMALLINT,
  ADD COLUMN IF NOT EXISTS target_unit VARCHAR(10);

-- 4. CHECK: либо все три NULL, либо все три заданы и валидны.
--    (min>=1, max>=min, unit ∈ {day, week})
ALTER TABLE complexes DROP CONSTRAINT IF EXISTS chk_complexes_cadence;
ALTER TABLE complexes ADD CONSTRAINT chk_complexes_cadence CHECK (
  (target_min IS NULL AND target_max IS NULL AND target_unit IS NULL)
  OR (
    target_min IS NOT NULL AND target_max IS NOT NULL AND target_unit IS NOT NULL
    AND target_min >= 1
    AND target_max >= target_min
    AND target_unit IN ('day', 'week')
  )
);

COMMIT;

-- ── Verification queries (выполнить после apply) ─────────────────────────────
-- 1. Колонки существуют:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='patients' AND column_name='assigned_instructor_id';
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='complexes' AND column_name IN ('target_min','target_max','target_unit')
--    ORDER BY column_name;   -- ожидание: 3 строки
-- 2. Бэкфилл проставлен:
--    SELECT id, created_by, assigned_instructor_id FROM patients ORDER BY id;
--    SELECT count(*) FROM patients
--    WHERE is_active=true AND assigned_instructor_id IS NULL AND created_by IS NOT NULL;
--    -- ожидание: 0 (NULL остаётся только у пациентов без created_by И без комплекса)
-- 3. CHECK существует:
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='complexes'::regclass AND conname='chk_complexes_cadence';
