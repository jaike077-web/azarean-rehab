-- =====================================================
-- 20260429: telegram_chat_id BIGINT → NUMERIC(20)
-- =====================================================
-- Проблема: Telegram OIDC начал возвращать sub > 9.22e18 (BIGINT max)
-- с 2024-2025 (примеры: 10399974012659476296). UPDATE patients SET
-- telegram_chat_id падал с code 22003 «out of range for type bigint»
-- на phone-autolink ветке OAuth callback'а.
--
-- pg-node всё равно возвращает int8 как строку (JS Number precision до 2^53),
-- поэтому миграция на NUMERIC не меняет поведение в JS-коде — только
-- расширяет диапазон. UNIQUE constraint и индекс пересоздаются.
--
-- Идемпотентна — повторный запуск проверяет тип и no-op'ит если уже NUMERIC.
-- =====================================================

DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'telegram_chat_id';

    IF current_type = 'bigint' THEN
        -- ALTER TYPE автоматически сохраняет UNIQUE constraint и data,
        -- но индекс btree создаётся заново. NUMERIC(20) — 20 значащих цифр,
        -- хватит на любой Telegram user_id (Telegram сейчас в диапазоне 10^19).
        ALTER TABLE patients
            ALTER COLUMN telegram_chat_id TYPE NUMERIC(20)
            USING telegram_chat_id::NUMERIC(20);
        RAISE NOTICE 'telegram_chat_id migrated BIGINT → NUMERIC(20)';
    ELSIF current_type = 'numeric' THEN
        RAISE NOTICE 'telegram_chat_id уже NUMERIC — no-op';
    ELSE
        RAISE EXCEPTION 'unexpected type for telegram_chat_id: %', current_type;
    END IF;
END $$;
