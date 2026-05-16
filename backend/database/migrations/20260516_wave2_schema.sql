-- Wave 2 коммит 2.01 — клинический дневник schema
-- Создаёт все таблицы Wave 2 одной идемпотентной миграцией
-- Sanity-tested + idempotency cycle verified

BEGIN;

-- ================================================================
-- 1. rom_measurements (ROM degrees + HBD cm + HBB categorical)
-- ================================================================
CREATE TABLE IF NOT EXISTS rom_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  value_degrees NUMERIC(5,1),
  value_cm NUMERIC(5,2),
  value_categorical VARCHAR(20),
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN (
    'instructor_direct', 'instructor_markup', 'ai_assisted', 'ai_unverified', 'patient_self'
  )),
  photo_url VARCHAR(500),
  ai_confidence NUMERIC(4,3),
  ai_raw_landmarks JSONB,
  ai_suggested_degrees NUMERIC(5,1),
  markup_points JSONB,
  measurement_session_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT rom_value_exactly_one CHECK (
    (CASE WHEN value_degrees IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_cm IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_categorical IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_rom_patient_type_date ON rom_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rom_session ON rom_measurements(measurement_session_id);
CREATE INDEX IF NOT EXISTS idx_rom_pending_verify ON rom_measurements(measured_at DESC) WHERE measured_by = 'ai_unverified';

-- ================================================================
-- 2. girth_measurements
-- ================================================================
CREATE TABLE IF NOT EXISTS girth_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  value_cm NUMERIC(5,2) NOT NULL CHECK (value_cm > 0 AND value_cm < 200),
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN ('instructor_direct', 'patient_self')),
  measurement_session_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_girth_patient_type_date ON girth_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_girth_session ON girth_measurements(measurement_session_id);

-- ================================================================
-- 3. pain_locations (справочник, seed в 2.02)
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_locations (
  code VARCHAR(50) PRIMARY KEY,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code) ON UPDATE CASCADE,
  label VARCHAR(100) NOT NULL,
  position SMALLINT DEFAULT 0,
  is_red_flag BOOLEAN DEFAULT FALSE,
  red_flag_reason VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_program_type ON pain_locations(program_type, is_active);

-- ================================================================
-- 4. pain_entries
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_entries (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vas_score SMALLINT NOT NULL CHECK (vas_score BETWEEN 0 AND 10),
  trigger_type VARCHAR(50) CHECK (trigger_type IN (
    'at_rest', 'on_flexion', 'on_extension', 'on_walking',
    'at_night', 'after_exercise', 'on_lifting', 'other'
  )),
  pain_character VARCHAR(50) CHECK (pain_character IN (
    'aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other'
  )),
  notes TEXT,
  is_event BOOLEAN NOT NULL DEFAULT FALSE,
  photo_url VARCHAR(500),
  red_flag_triggered BOOLEAN DEFAULT FALSE,
  ops_alert_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_daily_unique
  ON pain_entries(patient_id, entry_date) WHERE is_event = FALSE;
CREATE INDEX IF NOT EXISTS idx_pain_events
  ON pain_entries(patient_id, entry_date) WHERE is_event = TRUE;
CREATE INDEX IF NOT EXISTS idx_pain_red_flag
  ON pain_entries(created_at DESC) WHERE red_flag_triggered = TRUE;

-- ================================================================
-- 5. pain_entry_locations (junction)
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_entry_locations (
  pain_entry_id INT NOT NULL REFERENCES pain_entries(id) ON DELETE CASCADE,
  location_code VARCHAR(50) NOT NULL REFERENCES pain_locations(code) ON UPDATE CASCADE,
  PRIMARY KEY (pain_entry_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_entry ON pain_entry_locations(pain_entry_id);

-- ================================================================
-- 6. phase_transition_criteria
-- ================================================================
CREATE TABLE IF NOT EXISTS phase_transition_criteria (
  id SERIAL PRIMARY KEY,
  phase_id INT NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE,
  criterion_code VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN (
    'measurement', 'self_report', 'instructor_check'
  )),
  measurement_type VARCHAR(50),
  measurement_source VARCHAR(20),
  threshold_operator VARCHAR(5) CHECK (threshold_operator IN ('>=', '<=', '=', '>', '<', 'between')),
  threshold_value NUMERIC(7,2),
  threshold_value2 NUMERIC(7,2),
  staleness_days SMALLINT DEFAULT 7,
  self_report_question TEXT,
  self_report_hint TEXT,
  position SMALLINT DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (phase_id, criterion_code)
);

CREATE INDEX IF NOT EXISTS idx_criteria_phase ON phase_transition_criteria(phase_id, position) WHERE is_active = TRUE;

-- ================================================================
-- 7. patient_criterion_answers
-- ================================================================
CREATE TABLE IF NOT EXISTS patient_criterion_answers (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE CASCADE,
  criterion_id INT NOT NULL REFERENCES phase_transition_criteria(id) ON DELETE CASCADE,
  answer_bool BOOLEAN NOT NULL,
  answered_by_type VARCHAR(20) NOT NULL CHECK (answered_by_type IN ('patient', 'instructor')),
  answered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT answer_by_user_consistency CHECK (
    (answered_by_type = 'patient' AND answered_by_user_id IS NULL) OR
    (answered_by_type = 'instructor' AND answered_by_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_criterion_answers_patient_criterion
  ON patient_criterion_answers(patient_id, criterion_id, answered_at DESC);

-- ================================================================
-- 8. ALTER patients (personal reference + photo consent)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'measurement_reference_photo_url'
  ) THEN
    ALTER TABLE patients ADD COLUMN measurement_reference_photo_url VARCHAR(500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'photo_consent_at'
  ) THEN
    ALTER TABLE patients ADD COLUMN photo_consent_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'photo_consent_version'
  ) THEN
    ALTER TABLE patients ADD COLUMN photo_consent_version VARCHAR(20);
  END IF;
END $$;

COMMIT;
