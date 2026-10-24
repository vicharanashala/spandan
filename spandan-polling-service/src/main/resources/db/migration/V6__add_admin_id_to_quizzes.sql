-- Add admin_id column (initially nullable during migration)
ALTER TABLE quizzes ADD COLUMN admin_id UUID;

-- Backfill: copy teacher_id into admin_id for existing quizzes
UPDATE quizzes SET admin_id = teacher_id WHERE admin_id IS NULL;

-- Make admin_id NOT NULL after backfill
ALTER TABLE quizzes ALTER COLUMN admin_id SET NOT NULL;

-- Index for ownership lookups
CREATE INDEX idx_quizzes_admin_id ON quizzes(admin_id);
