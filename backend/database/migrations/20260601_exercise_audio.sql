-- =====================================================
-- 20260601_exercise_audio — Exercise Audio (EA1)
-- Длинный звук (музыка / голос-инструкция / медитация), привязанный к
-- УПРАЖНЕНИЮ (а не к cue). Надстройка над audio_presets (AA1).
-- ТЗ: SESSION_HANDOFF_2026-06-01_EA_EXERCISE_AUDIO.md, чекпойнт EA1.
--
-- Что добавляем (аддитивно, ничего не дропаем):
--   1. audio_presets.kind VARCHAR(16) NOT NULL DEFAULT 'cue'
--      Разделяет библиотеку на cue-пресеты (короткие бипы, 512КБ/10с — AA1)
--      и track-пресеты (длинные: музыка/голос/медитация, 10МБ/~5мин — EA2).
--      Существующие пресеты = 'cue' через DEFAULT. CHECK kind IN ('cue','track').
--      Размер всех (≤10МБ) влезает в size_bytes INTEGER — схему size НЕ меняем.
--      Per-kind лимит (multer 512КБ cue vs 10МБ track) — application-layer (EA2),
--      НЕ CHECK (зеркало AA1: size — multer-гард, не constraint).
--
--   2. exercises (библиотека) — ДЕФОЛТ звука упражнения:
--      audio_preset_id INTEGER REFERENCES audio_presets(id) ON DELETE SET NULL
--      audio_loop      BOOLEAN NOT NULL DEFAULT false  (зацикливать на упражнение)
--
--   3. complex_exercises (упражнение в комплексе) — ПЕРЕБИТЬ/ВЫКЛЮЧИТЬ дефолт:
--      audio_preset_id INTEGER REFERENCES audio_presets(id) ON DELETE SET NULL
--      audio_loop      BOOLEAN NOT NULL DEFAULT false
--      audio_off       BOOLEAN NOT NULL DEFAULT false  (явное «нет звука здесь»)
--
-- Модель резолва (EA3, в раннере EA5) — приоритет per-упражнение:
--   complex_exercises.audio_off = true        → нет звука (явное «выкл»)
--   иначе complex_exercises.audio_preset_id IS NOT NULL → этот пресет + его audio_loop
--   иначе exercises.audio_preset_id IS NOT NULL → дефолт библиотеки + exercises.audio_loop
--   иначе → нет звука.
-- (complex_exercises.audio_loop консультируется ТОЛЬКО когда задан complex preset_id;
--  в режиме наследования применяется exercises.audio_loop.)
--
-- CHECK'и «выкл = полностью выкл» (audio_off ⟹ нет ни пресета, ни лупа):
--   chk_ce_audio_off_no_preset: NOT (audio_off AND audio_preset_id IS NOT NULL)
--   chk_ce_audio_off_no_loop:   NOT (audio_off AND audio_loop)
--   audio_off=true означает «нет звука здесь»; тогда и override-пресет, и флаг
--   лупа бессмысленны (резолв возвращает «нет звука» на шаге 1, НЕ читая loop —
--   две CHECK не дают осесть orphan-состоянию (off=true, loop=true) из формы).
--   EA3-бэкенд нормализует: при audio_off=true → preset_id=NULL, audio_loop=false.
--
-- ON DELETE SET NULL (НЕ RESTRICT как у cue-bindings AA1): удаление пресета не
--   роняет упражнение — оно деградирует до «нет звука». Hard-delete пресета с
--   usage>0 всё равно блокируется на application-layer (409, EA2), soft-delete
--   (is_active=false) рекомендуется; SET NULL — безопасная подстраховка на случай
--   принудительного удаления (track-пресет может быть привязан к МНОГИМ
--   упражнениям, RESTRICT был бы слишком жёстким).
--
-- Принадлежность пресета типу (track для exercise-bindings, cue для cue-bindings)
--   валидируется на application-layer (EA3), НЕ DB-триггером — зеркало AA1, где
--   cue-bindings тоже не enforce'ят kind на уровне БД.
--
-- Additive, идемпотентна (DO + information_schema/pg_constraint exists-check +
-- CREATE INDEX IF NOT EXISTS — повторный прогон no-op). LF. Применять через
-- deploy/migrate.sh (checksum tracking), НЕ npm run migrate. Windows-dev:
-- PGCLIENTENCODING=UTF8 (кириллица в комментариях).
-- =====================================================

BEGIN;

-- =====================================================
-- Шаг 1: audio_presets.kind VARCHAR(16) NOT NULL DEFAULT 'cue'
-- Существующие строки получают 'cue' через DEFAULT (намеренно — все AA1-пресеты
-- были cue-звуками).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_presets' AND column_name = 'kind'
  ) THEN
    ALTER TABLE audio_presets
      ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'cue';
    RAISE NOTICE 'audio_presets.kind: added (default cue)';
  ELSE
    RAISE NOTICE 'audio_presets.kind: already exists, skip';
  END IF;
END $$;

-- CHECK на допустимые значения kind. Добавляется ПОСЛЕ колонки; все строки уже
-- 'cue' через DEFAULT → constraint валиден без backfill.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_audio_presets_kind'
      AND conrelid = 'audio_presets'::regclass
  ) THEN
    ALTER TABLE audio_presets
      ADD CONSTRAINT chk_audio_presets_kind
      CHECK (kind IN ('cue', 'track'));
    RAISE NOTICE 'chk_audio_presets_kind: added';
  ELSE
    RAISE NOTICE 'chk_audio_presets_kind: already exists, skip';
  END IF;
END $$;

-- =====================================================
-- Шаг 2: exercises — дефолт звука упражнения (библиотека).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'audio_preset_id'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN audio_preset_id INTEGER REFERENCES audio_presets(id) ON DELETE SET NULL;
    RAISE NOTICE 'exercises.audio_preset_id: added (FK SET NULL)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'audio_loop'
  ) THEN
    ALTER TABLE exercises
      ADD COLUMN audio_loop BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'exercises.audio_loop: added (default false)';
  END IF;
END $$;

-- =====================================================
-- Шаг 3: complex_exercises — перебить/выключить дефолт (per-комплекс).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises' AND column_name = 'audio_preset_id'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN audio_preset_id INTEGER REFERENCES audio_presets(id) ON DELETE SET NULL;
    RAISE NOTICE 'complex_exercises.audio_preset_id: added (FK SET NULL)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises' AND column_name = 'audio_loop'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN audio_loop BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'complex_exercises.audio_loop: added (default false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'complex_exercises' AND column_name = 'audio_off'
  ) THEN
    ALTER TABLE complex_exercises
      ADD COLUMN audio_off BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'complex_exercises.audio_off: added (default false)';
  END IF;
END $$;

-- CHECK: нельзя одновременно audio_off=true И задать override-пресет.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ce_audio_off_no_preset'
      AND conrelid = 'complex_exercises'::regclass
  ) THEN
    ALTER TABLE complex_exercises
      ADD CONSTRAINT chk_ce_audio_off_no_preset
      CHECK (NOT (audio_off AND audio_preset_id IS NOT NULL));
    RAISE NOTICE 'chk_ce_audio_off_no_preset: added';
  ELSE
    RAISE NOTICE 'chk_ce_audio_off_no_preset: already exists, skip';
  END IF;
END $$;

-- CHECK: при audio_off=true флаг лупа тоже бессмыслен → не даём осесть
-- orphan-состоянию (off=true, loop=true). Параллель к chk_ce_audio_off_no_preset.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ce_audio_off_no_loop'
      AND conrelid = 'complex_exercises'::regclass
  ) THEN
    ALTER TABLE complex_exercises
      ADD CONSTRAINT chk_ce_audio_off_no_loop
      CHECK (NOT (audio_off AND audio_loop));
    RAISE NOTICE 'chk_ce_audio_off_no_loop: added';
  ELSE
    RAISE NOTICE 'chk_ce_audio_off_no_loop: already exists, skip';
  END IF;
END $$;

-- =====================================================
-- Шаг 4: индексы на FK preset_id (usage_count COUNT в EA2 + ON DELETE SET NULL).
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_exercises_audio_preset
  ON exercises (audio_preset_id);
CREATE INDEX IF NOT EXISTS idx_ce_audio_preset
  ON complex_exercises (audio_preset_id);

COMMIT;

-- ── Verification queries (выполнить после apply) ─────────────────────────────
-- 1. audio_presets.kind + CHECK:
--    SELECT column_name, data_type, column_default, is_nullable
--    FROM information_schema.columns
--    WHERE table_name='audio_presets' AND column_name='kind';   -- varchar/'cue'::.../NO
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='chk_audio_presets_kind';
-- 2. exercises новые колонки:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='exercises' AND column_name IN ('audio_preset_id','audio_loop');  -- 2 строки
-- 3. complex_exercises новые колонки + CHECK:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='complex_exercises'
--      AND column_name IN ('audio_preset_id','audio_loop','audio_off');  -- 3 строки
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('chk_ce_audio_off_no_preset','chk_ce_audio_off_no_loop');
-- 4. FK ON DELETE правила (оба → 'n' SET NULL):
--    SELECT conrelid::regclass, confdeltype FROM pg_constraint
--    WHERE contype='f' AND conrelid IN ('exercises'::regclass,'complex_exercises'::regclass)
--      AND confrelid='audio_presets'::regclass;
-- 5. Индексы:
--    SELECT indexname FROM pg_indexes
--    WHERE indexname IN ('idx_exercises_audio_preset','idx_ce_audio_preset');  -- 2 строки
