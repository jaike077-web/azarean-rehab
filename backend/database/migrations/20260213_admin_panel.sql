-- =====================================================
-- Sprint 4: Admin Panel Migration
-- =====================================================

-- Добавить updated_at для отслеживания редактирования контента
ALTER TABLE tips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE phase_videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Индекс для быстрой фильтрации аудит-логов по типу сущности
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
