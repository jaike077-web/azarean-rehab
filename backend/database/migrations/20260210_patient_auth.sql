-- =====================================================
-- МИГРАЦИЯ: Система авторизации пациентов
-- Спринт 0.1
-- Дата: 2026-02-10
-- =====================================================

-- 1. Добавляем колонки к таблице patients (НЕ меняем существующие!)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 2. Таблица токенов сброса пароля
CREATE TABLE IF NOT EXISTS patient_password_resets (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Таблица refresh-токенов пациентов (ОТДЕЛЬНО от инструкторов!)
CREATE TABLE IF NOT EXISTS patient_refresh_tokens (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Таблица OAuth-состояний
CREATE TABLE IF NOT EXISTS patient_oauth_states (
    id SERIAL PRIMARY KEY,
    state VARCHAR(255) UNIQUE NOT NULL,
    provider VARCHAR(20) NOT NULL,
    redirect_url VARCHAR(500),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Индексы
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patient_resets_token ON patient_password_resets(token);
CREATE INDEX IF NOT EXISTS idx_patient_resets_patient ON patient_password_resets(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_refresh_token ON patient_refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_patient_refresh_patient ON patient_refresh_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_oauth_state ON patient_oauth_states(state);

-- =====================================================
-- КАК ПРИМЕНИТЬ:
-- psql -U postgres -d azarean_rehab -f backend/database/migrations/20260210_patient_auth.sql
-- =====================================================
