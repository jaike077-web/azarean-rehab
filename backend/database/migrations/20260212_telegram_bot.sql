-- =====================================================
-- SPRINT 3: Telegram Bot Migration
-- Дата: 2026-02-12
-- =====================================================

-- 1. Добавляем telegram_chat_id к таблице patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;

-- 2. Индекс для быстрого поиска по telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_patients_telegram_chat ON patients(telegram_chat_id);

-- 3. Таблица кодов привязки Telegram (одноразовые, 10 минут)
CREATE TABLE IF NOT EXISTS telegram_link_codes (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(32) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Индексы для telegram_link_codes
CREATE INDEX IF NOT EXISTS idx_telegram_link_code ON telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_link_expires ON telegram_link_codes(expires_at);

-- =====================================================
-- КАК ПРИМЕНИТЬ:
-- "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d azarean_rehab -f backend/database/migrations/20260212_telegram_bot.sql
-- =====================================================
