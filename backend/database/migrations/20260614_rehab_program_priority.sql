-- 20260614_rehab_program_priority.sql
-- Мультипрограммный «Путь» (M0, фундамент данных).
-- Добавляет ранг программы внутри активного набора пациента:
--   priority = 1  → ВЕДУЩАЯ зона (hero на главной, развёрнутый трек в «Пути»)
--   priority = 2,3… → вторичные по важности (сортировка ASC)
-- «Ведущая» = программа с минимальным priority среди активных (при равенстве — по created_at).
--
-- Аддитивно и идемпотентно. Существующие программы получают priority = 1
-- (сегодня у пациента ровно одна активная программа — дефолт корректен).
-- patient_cases (контейнер-эпизод) НЕ вводим: активные программы пациента = его кейс.

ALTER TABLE rehab_programs
  ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 1;

-- priority >= 1 (1 = ведущая). Гард — чтобы повторный прогон не падал.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rehab_programs_priority'
  ) THEN
    ALTER TABLE rehab_programs
      ADD CONSTRAINT chk_rehab_programs_priority CHECK (priority >= 1);
  END IF;
END $$;

-- Индекс под выборку активных программ пациента по приоритету (мультитрек-дашборд).
CREATE INDEX IF NOT EXISTS idx_rehab_programs_patient_priority
  ON rehab_programs (patient_id, priority)
  WHERE is_active = true AND status = 'active';
