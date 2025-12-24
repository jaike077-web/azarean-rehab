-- Add session tracking columns to progress_logs table
ALTER TABLE progress_logs
ADD COLUMN IF NOT EXISTS session_id BIGINT,
ADD COLUMN IF NOT EXISTS session_comment TEXT;

-- Add index for faster session queries
CREATE INDEX IF NOT EXISTS idx_progress_logs_session_id
ON progress_logs(session_id);

-- Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'progress_logs'
ORDER BY ordinal_position;
