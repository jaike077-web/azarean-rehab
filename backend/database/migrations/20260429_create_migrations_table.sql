-- =====================================================
-- 20260429_create_migrations_table
-- _migrations tracking table для checksum-based migration runner.
--
-- Защита от Bug #36 (schema drift) — отслеживаем какие миграции
-- применены и их checksum, чтобы поймать ситуацию когда уже
-- применённая миграция была изменена.
--
-- Bootstrap (пометка существующих миграций как already-applied
-- с NULL checksum для legacy) — выполняет deploy/migrate.sh
-- при первом прогоне, не эта миграция (она знает только сама себя).
--
-- Полностью идемпотентна — IF NOT EXISTS на всё.
-- =====================================================

CREATE TABLE IF NOT EXISTS _migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
  checksum VARCHAR(64)  -- SHA-256 hex, NULL для legacy bootstrap
);

CREATE INDEX IF NOT EXISTS idx_migrations_applied_at
  ON _migrations(applied_at);
