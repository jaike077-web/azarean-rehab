-- =====================================================
-- МИГРАЦИЯ: Обновления безопасности
-- Дата: 2026-02-04
-- Версия: 2.2.0
-- =====================================================

-- 1. Таблица для refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- 2. Добавляем колонки для блокировки аккаунта
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- 3. Таблица аудит-логов (152-ФЗ)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,      -- 'READ', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'
  entity_type VARCHAR(50) NOT NULL, -- 'patient', 'progress', 'complex', 'user'
  entity_id INTEGER,
  patient_id INTEGER,               -- Для быстрого поиска по пациенту
  ip_address INET,
  user_agent TEXT,
  details JSONB,                    -- Дополнительные данные
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient ON audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 4. Очистка истекших refresh tokens (запускать периодически через cron)
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();

-- 5. Комментарии к таблицам для документации
COMMENT ON TABLE refresh_tokens IS 'Хранение refresh токенов для JWT авторизации';
COMMENT ON TABLE audit_logs IS 'Журнал аудита доступа к персональным данным (152-ФЗ)';

COMMENT ON COLUMN users.failed_login_attempts IS 'Счетчик неудачных попыток входа';
COMMENT ON COLUMN users.locked_until IS 'Время до которого аккаунт заблокирован';

-- =====================================================
-- КАК ПРИМЕНИТЬ МИГРАЦИЮ:
-- psql -U postgres -d azarean_rehab -f 20260204_security_updates.sql
-- =====================================================
