-- Миграция: добавить колонки account lockout для пациентов
-- Зеркалирует механизм инструкторов (users.failed_login_attempts, users.locked_until)
-- Порог: 5 неудачных попыток → блокировка на 15 минут

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS failed_login_attempts SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
