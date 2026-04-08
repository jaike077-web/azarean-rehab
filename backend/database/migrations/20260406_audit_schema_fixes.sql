-- =====================================================
-- Миграция: Исправления схемы из аудита (2026-04-06)
-- M1: UNIQUE constraint на patient email (WHERE NOT NULL)
-- M7: Индекс на complex_exercises(exercise_id)
-- M8: NOT NULL на complexes.patient_id (проверка перед ALTER)
-- =====================================================

-- M1: Patient email должен быть уникален (где он есть)
-- Используем partial unique index — NULL emails разрешены (пациенты без email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_email_unique
  ON patients(email) WHERE email IS NOT NULL;

-- M7: Индекс на exercise_id для быстрых JOIN-ов
CREATE INDEX IF NOT EXISTS idx_complex_exercises_exercise
  ON complex_exercises(exercise_id);

-- M8: NOT NULL на complexes.patient_id
-- Сначала проверяем нет ли NULL записей
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM complexes WHERE patient_id IS NULL) THEN
    ALTER TABLE complexes ALTER COLUMN patient_id SET NOT NULL;
    RAISE NOTICE 'complexes.patient_id set to NOT NULL';
  ELSE
    RAISE WARNING 'Found complexes with NULL patient_id — cannot add NOT NULL constraint. Fix data first.';
  END IF;
END $$;
