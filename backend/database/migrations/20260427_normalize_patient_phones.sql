-- =====================================================
-- 20260427_normalize_patient_phones
-- Бэкфилл: приводим существующие patients.phone к E.164.
--
-- Зачем: Telegram OIDC отдаёт verified-phone в формате +CCXXXXXXXXX.
-- Чтобы phone-match работал на silent autolink, надо чтобы все строки
-- в БД были в том же формате. Инструкторы вводили как угодно
-- ("+7 (900) 123-45-67", "8 900 ...", "9001234567" и т.д.).
--
-- Правила (зеркало backend/utils/phone.js normalizePhone):
--   - strip всё кроме цифр и ведущего +
--   - "8" + 10 цифр → "+7" + 10 цифр (РФ local)
--   - "7" + 10 цифр без + → "+" + 11 цифр
--   - 10 цифр без префикса → "+7" + 10 цифр (assume РФ)
--   - + + 10-15 цифр → как есть
--   - всё остальное → не трогаем (явный мусор лучше оставить как было,
--     чтобы инструктор увидел в UI и поправил руками)
--
-- Идемпотентна: повторный прогон не меняет уже нормализованные строки.
-- =====================================================

DO $$
DECLARE
  rec RECORD;
  has_plus BOOLEAN;
  digits TEXT;
  candidate TEXT;
  changed_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR rec IN
    SELECT id, phone FROM patients WHERE phone IS NOT NULL AND phone <> ''
  LOOP
    has_plus := LEFT(rec.phone, 1) = '+';
    digits := regexp_replace(rec.phone, '[^0-9]', '', 'g');

    candidate := NULL;

    IF digits = '' THEN
      candidate := NULL;
    ELSIF has_plus THEN
      candidate := '+' || digits;
    ELSIF length(digits) = 11 AND LEFT(digits, 1) = '8' THEN
      candidate := '+7' || SUBSTRING(digits FROM 2);
    ELSIF length(digits) = 11 AND LEFT(digits, 1) = '7' THEN
      candidate := '+' || digits;
    ELSIF length(digits) = 10 THEN
      candidate := '+7' || digits;
    ELSIF length(digits) BETWEEN 11 AND 15 THEN
      candidate := '+' || digits;
    END IF;

    -- Финальная валидация E.164: +<10..15 цифр>
    IF candidate IS NOT NULL AND candidate ~ '^\+[0-9]{10,15}$' THEN
      IF candidate <> rec.phone THEN
        UPDATE patients SET phone = candidate, updated_at = NOW() WHERE id = rec.id;
        changed_count := changed_count + 1;
      END IF;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'phone normalize: changed=%, skipped (kept as-is)=%', changed_count, skipped_count;
END $$;
