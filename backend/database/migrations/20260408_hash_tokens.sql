-- Миграция: хеширование refresh/reset токенов (SHA-256)
-- Заменяем plaintext колонку `token` на `token_hash` (64 hex chars)
-- ВНИМАНИЕ: все существующие сессии инвалидируются (пользователи должны заново войти)
--
-- Идемпотентность: вся DDL-часть обёрнута проверкой "есть ли ещё старая колонка
-- token". После первой успешной прогонки колонки token нет → блок пропускается,
-- TRUNCATE не повторяется (иначе на каждом редеплое будут разлогинены все юзеры).

DO $$
DECLARE
    needs_migration BOOLEAN;
BEGIN
    -- Индикатор: миграция ещё не прогонялась, если token всё ещё есть хоть в одной
    -- из трёх таблиц
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name IN ('refresh_tokens','patient_refresh_tokens','patient_password_resets')
           AND column_name = 'token'
    ) INTO needs_migration;

    IF needs_migration THEN
        -- Инвалидация существующих токенов (только при первичной миграции)
        TRUNCATE refresh_tokens;
        TRUNCATE patient_refresh_tokens;
        TRUNCATE patient_password_resets;

        -- refresh_tokens: инструкторские refresh токены
        ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS token;
        ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64) NOT NULL;

        -- patient_refresh_tokens: пациентские refresh токены
        ALTER TABLE patient_refresh_tokens DROP COLUMN IF EXISTS token;
        ALTER TABLE patient_refresh_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64) NOT NULL;

        -- patient_password_resets: токены сброса пароля (отправляются по email)
        ALTER TABLE patient_password_resets DROP COLUMN IF EXISTS token;
        ALTER TABLE patient_password_resets ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64) NOT NULL;

        RAISE NOTICE 'Migrated token → token_hash in 3 tables (sessions invalidated)';
    ELSE
        RAISE NOTICE 'token_hash already in place — skipping (idempotent re-run)';
    END IF;
END $$;

-- Индексы — идемпотентно сами по себе, вне блока
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash         ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_refresh_tokens_hash ON patient_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_password_resets_hash ON patient_password_resets(token_hash);
