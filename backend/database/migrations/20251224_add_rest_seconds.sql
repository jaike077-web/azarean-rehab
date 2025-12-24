-- Migration: Add rest_seconds column to template_exercises
-- Date: 2025-12-24
-- Author: Vadim
-- Description: Fix missing rest_seconds column that caused template save errors

-- Add column if not exists
ALTER TABLE template_exercises 
ADD COLUMN IF NOT EXISTS rest_seconds INTEGER DEFAULT 60;

-- Verify column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'template_exercises' 
    AND column_name = 'rest_seconds'
  ) THEN
    RAISE EXCEPTION 'Migration failed: rest_seconds column was not created';
  END IF;
END $$;

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'Migration completed: rest_seconds column added to template_exercises';
END $$;
```