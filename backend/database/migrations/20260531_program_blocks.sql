-- ARC-CYCLE AC1: микроцикл-слой — program_blocks + program_block_complexes
-- =====================================================
-- Tracker: TZ_ARC_CYCLE_MICROCYCLE (AC1 в цепочке AC1→AC7).
--
-- Что и зачем:
--   Контейнер-слой над rehab_programs.complex_id (одиночный FK). Поглощает обе
--   точки конвергенции из рекона: (1) одиночный указатель комплекса,
--   (2) цель/scope-подсчёта, привязанные к одному complex_id.
--
--   Две формы набора:
--     • Гимнастика (block_type='gymnastics') — плоский дневной набор,
--       все комплексы доступны ежедневно, без ротации. Day-grained цель.
--     • Тренировка (block_type='training') — микроцикл, упорядоченные дни
--       (А/Б/В), ротация последовательностью (закрыл А → следующий Б).
--       Week-grained цель. Указатель current_day_index.
--
--   АДДИТИВНО: rehab_programs.complex_id ОСТАЁТСЯ рабочим fallback'ом —
--   программы без блоков ведут себя как сейчас (legacy single-complex).
--   БЕЗ backfill (рискованный на проде; пилотные пациенты работают через fallback).
--
--   Цель живёт на БЛОКЕ (не на complexes — рекон: complexes.target_* без
--   write-path, всегда NULL). Форма цели — образец chk_complexes_cadence
--   (20260526, Wave 3 C1) + per-type unit: gymnastics→'day', training→'week'.
--
-- 1:N — день ротации (day_index) группирует 1..N комплексов; гимнастика =
--   комплексы с day_index IS NULL (плоско). UNIQUE(block_id, complex_id).
--
-- Идемпотентна: CREATE TABLE IF NOT EXISTS + DO/pg_constraint/information_schema
--   exists-check (образец 20260527_ce_tempo_autocomplete). Cycle
--   createdb → schema → migrations×2 проходит чисто.

BEGIN;

-- =====================================================
-- Шаг 1: program_blocks — контейнер
-- =====================================================
CREATE TABLE IF NOT EXISTS program_blocks (
  id                       SERIAL PRIMARY KEY,
  program_id               INTEGER NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  block_type               VARCHAR(20) NOT NULL,
  title                    VARCHAR(255),
  position                 SMALLINT NOT NULL DEFAULT 0,
  -- цель (форма как chk_complexes_cadence + per-type unit, см. chk_block_cadence)
  target_min               SMALLINT,
  target_max               SMALLINT,
  target_unit              VARCHAR(10),
  -- ротация (только training; gymnastics → всё NULL, см. chk_block_rotation)
  current_day_index        SMALLINT,
  current_day_started_at   TIMESTAMP,
  last_advanced_session_id BIGINT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

-- chk_block_type: enum block_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_block_type' AND conrelid = 'program_blocks'::regclass
  ) THEN
    ALTER TABLE program_blocks
      ADD CONSTRAINT chk_block_type
      CHECK (block_type IN ('gymnastics', 'training'));
    RAISE NOTICE 'chk_block_type: added';
  ELSE
    RAISE NOTICE 'chk_block_type: already exists, skip';
  END IF;
END $$;

-- chk_block_cadence: всё-NULL или всё-задано + границы + per-type unit
-- (gymnastics обязан 'day', training обязан 'week')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_block_cadence' AND conrelid = 'program_blocks'::regclass
  ) THEN
    ALTER TABLE program_blocks
      ADD CONSTRAINT chk_block_cadence
      CHECK (
        (target_min IS NULL AND target_max IS NULL AND target_unit IS NULL)
        OR (
          target_min IS NOT NULL AND target_max IS NOT NULL AND target_unit IS NOT NULL
          AND target_min >= 1
          AND target_max >= target_min
          AND (
            (block_type = 'gymnastics' AND target_unit = 'day')
            OR (block_type = 'training'  AND target_unit = 'week')
          )
        )
      );
    RAISE NOTICE 'chk_block_cadence: added';
  ELSE
    RAISE NOTICE 'chk_block_cadence: already exists, skip';
  END IF;
END $$;

-- chk_block_rotation: указатель дня только у training; gymnastics → NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_block_rotation' AND conrelid = 'program_blocks'::regclass
  ) THEN
    ALTER TABLE program_blocks
      ADD CONSTRAINT chk_block_rotation
      CHECK (block_type = 'training' OR current_day_index IS NULL);
    RAISE NOTICE 'chk_block_rotation: added';
  ELSE
    RAISE NOTICE 'chk_block_rotation: already exists, skip';
  END IF;
END $$;

-- =====================================================
-- Шаг 2: program_block_complexes — junction блок↔комплекс
-- =====================================================
CREATE TABLE IF NOT EXISTS program_block_complexes (
  id         SERIAL PRIMARY KEY,
  block_id   INTEGER NOT NULL REFERENCES program_blocks(id) ON DELETE CASCADE,
  complex_id INTEGER NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  day_index  SMALLINT,           -- training: 1-based день ротации; gymnastics: NULL (плоско)
  label      VARCHAR(100),       -- «День А» и т.п.
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_pbc_block_complex UNIQUE (block_id, complex_id)
);

-- =====================================================
-- Шаг 3: индексы
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_program_blocks_program
  ON program_blocks (program_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pbc_block_day
  ON program_block_complexes (block_id, day_index);

COMMIT;

-- ── Verification queries (выполнить после apply, Rule #15) ───────────────────
-- 1. Таблицы существуют:
--    \d program_blocks
--    \d program_block_complexes
-- 2. CHECK'и существуют:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid IN ('program_blocks'::regclass,'program_block_complexes'::regclass)
--    ORDER BY conname;
--    -- ожидание: chk_block_cadence, chk_block_rotation, chk_block_type,
--    --            uq_pbc_block_complex (+ FK/PK)
-- 3. Negative-проверки (должны ОТКЛОНЯТЬСЯ):
--    INSERT gymnastics с target_unit='week'  → нарушает chk_block_cadence
--    INSERT training   с target_unit='day'   → нарушает chk_block_cadence
--    INSERT gymnastics с current_day_index=1 → нарушает chk_block_rotation
--    дубль (block_id, complex_id)            → нарушает uq_pbc_block_complex
