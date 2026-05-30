-- =====================================================
-- 20260530_patient_audio_overrides
-- Custom Audio Upload (CA1) — пациентские звуки per-cue
--
-- Надстройка над audio-арком (CP1 AudioContext + cue-каталог). Хранит
-- загруженные пациентом override-звуки для cue'ов раннера. Один override
-- на (patient_id, cue_name) — UNIQUE. Re-upload поверх удаляет старый файл
-- и upsert'ит строку (логика в backend CA2).
--
-- file_path — серверная деталь (НЕ отдаётся в JSON; SELECT-allowlist в CA2:
-- cue_name/mime_type/size_bytes/original_filename/uploaded_at).
-- cue_name CHECK включает все 5 cue'ов CP1 (forward-compat: tempo_tick пока
-- не озвучен — CP3b отложен, но в каталоге, чтобы не плодить будущую миграцию).
-- size_bytes лимит (≤512КБ) — application-layer (multer fileSize, CA2),
-- не CHECK в БД (зеркало avatar-аплоада, meta drift #26).
--
-- Additive, идемпотентна (CREATE TABLE IF NOT EXISTS — повторный прогон no-op).
-- LF. Применять через deploy/migrate.sh (checksum tracking), НЕ npm run migrate.
-- =====================================================

CREATE TABLE IF NOT EXISTS patient_audio_overrides (
  id                SERIAL PRIMARY KEY,
  patient_id        INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  cue_name          VARCHAR(32) NOT NULL,
  file_path         VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(64) NOT NULL,
  size_bytes        INT NOT NULL,
  original_filename VARCHAR(255),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_patient_audio_overrides_cue_name
    CHECK (cue_name IN ('count_tick', 'set_start', 'set_end', 'rest_end', 'tempo_tick')),
  CONSTRAINT uq_patient_audio_overrides_patient_cue
    UNIQUE (patient_id, cue_name)
);
