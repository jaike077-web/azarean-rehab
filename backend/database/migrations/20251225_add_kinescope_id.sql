ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS kinescope_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_exercises_kinescope_id
ON exercises(kinescope_id);
