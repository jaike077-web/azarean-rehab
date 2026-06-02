-- =====================================================
-- 20260602_audio_cue_tone_config — редактор «Стандартного тона» (CT1)
-- Аддитивная колонка для параметров встроенного тона события (cue) когда
-- на cue НЕ назначен загруженный пресет (preset_id=NULL = «стандартный тон»).
-- Надстройка над AA1 (audio_cue_defaults — глобальная дом-карта).
-- ТЗ: SESSION_HANDOFF_2026-06-02_CUSTOM_TONE_EDITOR.md, чекпойнт CT1.
--
-- Scope = Вариант А (глобально, дом-карта): тон события один на всю студию.
-- Per-комплекс кастомизация тона НЕ предусмотрена (complex_cue_sounds тон не несёт).
--
-- tone_config JSONB (nullable):
--   NULL                                  → стандартный тон CP1 из getCueConfig(cue)
--   { "frequencies": [Гц,…],              → кастомный тон: частоты последовательно,
--     "durationMs": <мс>, "type": "<форма волны>" }   суммарная длительность, форма волны.
--   gain НЕ редактируем — раннер берёт его из getCueConfig(cue) (CT3).
--
-- Валидация формы (frequencies[] 20..20000, durationMs 20..2000,
-- type ∈ sine/square/triangle/sawtooth) — application-layer в CT2 (зеркало
-- решения AA1: размер пресета — multer, не CHECK). На уровне БД — только nullable JSONB.
--
-- Additive, идемпотентна (ADD COLUMN IF NOT EXISTS — повторный прогон no-op). LF.
-- Применять через deploy/migrate.sh (checksum tracking), НЕ npm run migrate.
-- Windows-dev: PGCLIENTENCODING=UTF8 (кириллица в комментариях).
-- =====================================================

BEGIN;

ALTER TABLE audio_cue_defaults
  ADD COLUMN IF NOT EXISTS tone_config JSONB;

COMMENT ON COLUMN audio_cue_defaults.tone_config IS
  'Параметры встроенного тона события когда preset_id=NULL. NULL=дефолт getCueConfig. Форма: {frequencies:[Гц],durationMs,type}. Валидация — application-layer (CT2).';

COMMIT;

-- ── Verification queries (выполнить после apply) ─────────────────────────────
-- 1. Колонка существует и JSONB:
--    SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name='audio_cue_defaults' AND column_name='tone_config';
--    -- ожидание: tone_config | jsonb | YES
-- 2. Существующие строки дом-карты не сломаны (tone_config = NULL по умолчанию):
--    SELECT cue_name, preset_id, is_locked, tone_config FROM audio_cue_defaults;
