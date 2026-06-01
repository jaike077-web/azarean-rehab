-- =====================================================
-- 20260530b_audio_presets_and_bindings — Custom Audio (AA1)
-- Админ-слой кастомных звуков раннера: библиотека пресетов +
-- назначение звука на cue (глобальная дом-карта + per-комплекс).
-- Надстройка над CP1 (cue-каталог) и CA1 (patient_audio_overrides).
-- ТЗ: TZ_CUSTOM_AUDIO_ADMIN_PRESETS.md, чекпойнт AA1.
--
-- 3 таблицы:
--   audio_presets       — cue-агностичная библиотека загруженных звуков.
--   audio_cue_defaults  — глобальная дом-карта cue → пресет (+lock). 1 строка на cue.
--   complex_cue_sounds  — per-комплекс привязка cue → пресет (+lock). Перебивает дом-карту.
--
-- Приоритет resolution (в раннере, AA5): залоч.-программа → пациентский
-- override (CA4) → программа(незалоч.) → стандартный тон CP1. Никогда не молчим.
-- preset_id = NULL в complex_cue_sounds = «явный тон» (перебить дом-карту назад на тон).
-- Отсутствие строки complex_cue_sounds = наследовать дом-карту.
-- Отсутствие строки audio_cue_defaults = стандартный тон CP1.
--
-- file_path — серверная деталь (НЕ в JSON; SELECT-allowlist в AA2/AA3).
-- size лимит (≤512КБ) — application-layer (multer), не CHECK (зеркало CA, meta drift #26).
-- cue_name CHECK включает все 5 cue CP1 (tempo_tick forward-compat, CP3b отложен).
--
-- ON DELETE: complexes → complex_cue_sounds CASCADE (звук — деталь комплекса);
-- audio_presets ← (defaults / complex bindings) RESTRICT → 409-паттерн (нельзя
-- hard-delete используемый пресет; soft-delete is_active=false при ссылках — AA2).
-- users → created_by/updated_by SET NULL (пресет переживает удаление автора).
--
-- Additive, идемпотентна (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS —
-- повторный прогон no-op). LF. Применять через deploy/migrate.sh (checksum tracking),
-- НЕ npm run migrate. Windows-dev: PGCLIENTENCODING=UTF8 (кириллица в комментариях).
-- =====================================================

BEGIN;

-- 1. Библиотека пресетов (cue-агностичные именованные звуки).
--    Один загруженный файл = один пресет = переиспользуем на N cue/комплексов.
CREATE TABLE IF NOT EXISTS audio_presets (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL,
  file_path         VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(64)  NOT NULL,
  size_bytes        INTEGER      NOT NULL,
  duration_ms       INTEGER,                       -- nullable; клиент-хинт для display, НЕ контроль
  original_filename VARCHAR(255),
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Глобальная дом-карта cue → пресет («дом-звук студии»). 1 строка на cue (PK).
--    preset_id NULL = «стандартный тон» (можно залочить). is_locked — пациент не перебьёт.
CREATE TABLE IF NOT EXISTS audio_cue_defaults (
  cue_name   VARCHAR(32) PRIMARY KEY,
  preset_id  INTEGER REFERENCES audio_presets(id) ON DELETE RESTRICT,
  is_locked  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_audio_cue_defaults_cue_name
    CHECK (cue_name IN ('count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick'))
);

-- 3. Per-комплекс привязка cue → пресет (точечный override дом-карты).
--    UNIQUE(complex_id, cue_name) — 1 привязка на (комплекс, cue).
--    preset_id NULL = «явный тон» (перебить дом-карту назад на тон).
CREATE TABLE IF NOT EXISTS complex_cue_sounds (
  id         SERIAL PRIMARY KEY,
  complex_id INTEGER NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  cue_name   VARCHAR(32) NOT NULL,
  preset_id  INTEGER REFERENCES audio_presets(id) ON DELETE RESTRICT,
  is_locked  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_complex_cue_sounds_cue_name
    CHECK (cue_name IN ('count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick')),
  CONSTRAINT uq_complex_cue_sounds_complex_cue
    UNIQUE (complex_id, cue_name)
);

-- Индекс на FK preset_id для reference-проверок (ON DELETE RESTRICT + usage_count
-- COUNT в AA2). complex_id покрыт префиксом UNIQUE(complex_id, cue_name).
CREATE INDEX IF NOT EXISTS idx_complex_cue_sounds_preset
  ON complex_cue_sounds (preset_id);

COMMIT;

-- ── Verification queries (выполнить после apply) ─────────────────────────────
-- 1. Таблицы существуют:
--    SELECT to_regclass('public.audio_presets'),
--           to_regclass('public.audio_cue_defaults'),
--           to_regclass('public.complex_cue_sounds');   -- ожидание: 3 non-NULL
-- 2. CHECK cue_name (обе таблицы):
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('chk_audio_cue_defaults_cue_name','chk_complex_cue_sounds_cue_name');
-- 3. UNIQUE на complex_cue_sounds:
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname='uq_complex_cue_sounds_complex_cue';
-- 4. FK ON DELETE правила:
--    SELECT conname, confdeltype FROM pg_constraint
--    WHERE conrelid IN ('audio_cue_defaults'::regclass,'complex_cue_sounds'::regclass)
--      AND contype='f';   -- preset_id → 'r' (RESTRICT), complex_id → 'c' (CASCADE)
