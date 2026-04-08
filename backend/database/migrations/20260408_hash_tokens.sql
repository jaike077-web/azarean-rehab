-- Миграция: хеширование refresh/reset токенов (SHA-256)
-- Заменяем plaintext колонку `token` на `token_hash` (64 hex chars)
-- ВНИМАНИЕ: все существующие сессии инвалидируются (пользователи должны заново войти)

-- Инвалидация существующих токенов
TRUNCATE refresh_tokens;
TRUNCATE patient_refresh_tokens;
TRUNCATE patient_password_resets;

-- refresh_tokens: инструкторские refresh токены
ALTER TABLE refresh_tokens DROP COLUMN token;
ALTER TABLE refresh_tokens ADD COLUMN token_hash VARCHAR(64) NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- patient_refresh_tokens: пациентские refresh токены
ALTER TABLE patient_refresh_tokens DROP COLUMN token;
ALTER TABLE patient_refresh_tokens ADD COLUMN token_hash VARCHAR(64) NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_refresh_tokens_hash ON patient_refresh_tokens(token_hash);

-- patient_password_resets: токены сброса пароля (отправляются по email)
ALTER TABLE patient_password_resets DROP COLUMN token;
ALTER TABLE patient_password_resets ADD COLUMN token_hash VARCHAR(64) NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_password_resets_hash ON patient_password_resets(token_hash);
