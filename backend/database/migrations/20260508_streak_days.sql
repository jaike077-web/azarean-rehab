-- 2026-05-08: streak_days table for non-reset activity tracking
-- Wave 0, commit 01 — Patient UX Roadmap v2 #7
--
-- Старая логика updateStreak (rehab.js + telegramBot.js дубль) обнуляла
-- current_streak до 1 при пропуске дня. После v12-редизайна DiaryScreen
-- exercises_done больше не выставляется в UI → updateStreak не вызывался
-- никогда → стрик у всех висел на нуле.
--
-- Новая модель: уникальные дни активности в streak_days. UNIQUE constraint
-- делает запись идемпотентной (несколько активностей в один день = 1 запись).
-- current_streak = total active days, longest_streak = max consecutive run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streak_days'
  ) THEN
    CREATE TABLE streak_days (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      program_id INTEGER REFERENCES rehab_programs(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL,
      source VARCHAR(20) NOT NULL CHECK (source IN ('progress', 'diary', 'mini', 'manual')),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (patient_id, activity_date, program_id)
    );

    CREATE INDEX idx_streak_days_patient_date ON streak_days(patient_id, activity_date);
    CREATE INDEX idx_streak_days_program ON streak_days(program_id);

    -- Бэкфилл: для каждого активного стрика создаём по одной записи
    -- на last_activity_date. Без истории по дням — просто сохраняем факт
    -- что активность была. Берём только за последние 90 дней чтобы не
    -- тащить мёртвые legacy-стрики из 2024.
    INSERT INTO streak_days (patient_id, program_id, activity_date, source)
    SELECT
      patient_id,
      program_id,
      last_activity_date,
      'manual'
    FROM streaks
    WHERE last_activity_date IS NOT NULL
      AND last_activity_date >= CURRENT_DATE - INTERVAL '90 days'
    ON CONFLICT (patient_id, activity_date, program_id) DO NOTHING;
  END IF;
END $$;
