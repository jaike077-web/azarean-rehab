-- CP2a: complex_exercises — авто-завершение по таймеру + темп подхода
-- =====================================================
-- Tracker: TZ_TIMER_AUDIO_TIMESETS_CP2_SCHEMA (CP2 в цепочке после CP1 audio).
--
-- Что и зачем:
--   1. auto_complete BOOLEAN NOT NULL DEFAULT true
--      Переключатель семантики duration_seconds: true → countdown с авто-
--      завершением (CP3a поведение), false → открытый секундомер вверх
--      (текущее поведение). Существующие строки получают true через DEFAULT
--      — намеренный апгрейд (pre-pilot, Vadim подтвердил).
--      "work_seconds" из ранних TZ — это переиспользование существующего
--      duration_seconds, новой колонки НЕ создаём.
--
--   2. tempo_eccentric_s / tempo_pause_s / tempo_concentric_s SMALLINT nullable
--      Темп подхода в секундах: эксцентрик (опускание) / пауза / концентрик
--      (подъём). 3-0-3 = ecc=3, pause=0, con=3. Темп опционален, но если
--      задан — обязаны быть все три (CHECK chk_ce_tempo).
--
--   3. CHECK chk_ce_has_prescription: reps IS NOT NULL OR duration_seconds IS NOT NULL
--      Защита от пустых подходов. Backfill empty rows перед добавлением CHECK,
--      иначе constraint упадёт на существующих NULL/NULL строках.
--
--   4. CHECK chk_ce_tempo: «всё NULL или всё задано» + границы 1..30 / 0..30.
--      Образец — chk_complexes_cadence из 20260526_instructor_assignment_and_cadence
--      (Wave 3 C1). Пауза >=0, фазы движения >=1.
--
-- Модель аддитивная — НЕ XOR: reps + duration_seconds + темп сосуществуют.
-- Клиентский «disabled reps при duration_seconds>0» (CreateComplex.js:95)
-- снимается в CP2b.
--
-- Идемпотентна: DO + information_schema/pg_constraint exists-check.
-- Cycle createdb → schema → migrations×2 проходит чисто.

BEGIN;

-- =====================================================
-- Шаг 1: recon-guard + backfill пустых строк
-- =====================================================
-- На dev pre-pilot ожидание ~0 (см. отчёт CP2a recon). Backfill идемпотентен:
-- повторный прогон не тронет строки где reps уже NOT NULL.
UPDATE complex_exercises
   SET reps = 10
 WHERE reps IS NULL
   AND duration_seconds IS NULL;

-- =====================================================
-- Шаг 2: auto_complete BOOLEAN NOT NULL DEFAULT true
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises'
      AND column_name = 'auto_complete'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN auto_complete BOOLEAN NOT NULL DEFAULT true;
    RAISE NOTICE 'complex_exercises.auto_complete: added (default true)';
  ELSE
    RAISE NOTICE 'complex_exercises.auto_complete: already exists, skip';
  END IF;
END $$;

-- =====================================================
-- Шаг 3: tempo_* SMALLINT nullable (3 колонки)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises'
      AND column_name = 'tempo_eccentric_s'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN tempo_eccentric_s SMALLINT;
    RAISE NOTICE 'complex_exercises.tempo_eccentric_s: added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises'
      AND column_name = 'tempo_pause_s'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN tempo_pause_s SMALLINT;
    RAISE NOTICE 'complex_exercises.tempo_pause_s: added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises'
      AND column_name = 'tempo_concentric_s'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN tempo_concentric_s SMALLINT;
    RAISE NOTICE 'complex_exercises.tempo_concentric_s: added';
  END IF;
END $$;

-- =====================================================
-- Шаг 4: chk_ce_has_prescription — защита от пустых подходов.
-- Добавляется ПОСЛЕ backfill (иначе упадёт на NULL/NULL строках).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ce_has_prescription'
      AND conrelid = 'complex_exercises'::regclass
  ) THEN
    ALTER TABLE complex_exercises
      ADD CONSTRAINT chk_ce_has_prescription
      CHECK (reps IS NOT NULL OR duration_seconds IS NOT NULL);
    RAISE NOTICE 'chk_ce_has_prescription: added';
  ELSE
    RAISE NOTICE 'chk_ce_has_prescription: already exists, skip';
  END IF;
END $$;

-- =====================================================
-- Шаг 5: chk_ce_tempo — «всё NULL или всё задано» + границы.
-- Образец: chk_complexes_cadence (20260526, Wave 3 C1).
-- Пауза может быть 0 (без задержки), фазы движения >=1 сек.
-- Верхняя граница 30с — sanity (типичный rehab темп 1..6с на фазу).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ce_tempo'
      AND conrelid = 'complex_exercises'::regclass
  ) THEN
    ALTER TABLE complex_exercises
      ADD CONSTRAINT chk_ce_tempo
      CHECK (
        (tempo_eccentric_s IS NULL
         AND tempo_pause_s IS NULL
         AND tempo_concentric_s IS NULL)
        OR
        (tempo_eccentric_s IS NOT NULL
         AND tempo_pause_s IS NOT NULL
         AND tempo_concentric_s IS NOT NULL
         AND tempo_eccentric_s >= 1
         AND tempo_concentric_s >= 1
         AND tempo_pause_s >= 0
         AND tempo_eccentric_s <= 30
         AND tempo_pause_s <= 30
         AND tempo_concentric_s <= 30)
      );
    RAISE NOTICE 'chk_ce_tempo: added';
  ELSE
    RAISE NOTICE 'chk_ce_tempo: already exists, skip';
  END IF;
END $$;

COMMIT;
