-- =====================================================
-- 20260427_patient_invite_codes
-- Invite-code flow для пациентской регистрации
--
-- Цель: закрыть архитектурный gap «self-registered пациент
-- невидим инструктору» (created_by=NULL после прямой
-- регистрации на /patient-register).
--
-- Flow:
-- 1) Инструктор создаёт пациента (POST /api/patients) — created_by ставится
-- 2) Инструктор генерирует invite-код (POST /api/patients/:id/invite-code)
-- 3) Пациент вводит код на /patient-register → backend линкует
--    регистрацию к существующему patient_id (UPDATE patients SET email,
--    password_hash, ... WHERE id = code.patient_id)
--
-- Идемпотентна (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
-- =====================================================

CREATE TABLE IF NOT EXISTS patient_invite_codes (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_invite_code_hash
  ON patient_invite_codes(code_hash);

CREATE INDEX IF NOT EXISTS idx_patient_invite_codes_patient
  ON patient_invite_codes(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_invite_codes_active
  ON patient_invite_codes(expires_at) WHERE used_at IS NULL;
