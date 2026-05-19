-- HF#11: measurement_session_id INTEGER → BIGINT
-- ====================================================
-- Закрывает drift #25 (TZ 2.06 smoke сценарий 2): client-generated
-- Date.now() millis (13 digits, ~1.7×10^12) переполняет int4
-- (max 2.15×10^9) → PG 22003 numeric_value_out_of_range → 500.
--
-- Frontend (TZ 2.08) сможет использовать Date.now() как session_id для
-- bilateral L/R pair (один millis на пару). millis ≪ 2^53 → safe для
-- JS Number conversion (pg-node setTypeParser в db.js).
--
-- Backwards-compatible: все int4 values укладываются в int8 range,
-- backfill не требуется. ALTER COLUMN TYPE — full table rewrite в PG,
-- на пустых dev таблицах мгновенно. Для будущих больших prod таблиц
-- потребуется maintenance window или new-column-backfill-swap pattern
-- (Wave 3 backlog).
--
-- Идемпотентна через information_schema check — повторный run no-op.

BEGIN;

-- rom_measurements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rom_measurements'
      AND column_name = 'measurement_session_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE rom_measurements
      ALTER COLUMN measurement_session_id TYPE BIGINT;
    RAISE NOTICE 'rom_measurements.measurement_session_id: integer → bigint';
  ELSE
    RAISE NOTICE 'rom_measurements.measurement_session_id: already bigint or column missing, skip';
  END IF;
END $$;

-- girth_measurements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'girth_measurements'
      AND column_name = 'measurement_session_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE girth_measurements
      ALTER COLUMN measurement_session_id TYPE BIGINT;
    RAISE NOTICE 'girth_measurements.measurement_session_id: integer → bigint';
  ELSE
    RAISE NOTICE 'girth_measurements.measurement_session_id: already bigint or column missing, skip';
  END IF;
END $$;

COMMIT;
