-- Renames ownership columns to reflect ADMIN role transfer.
-- All existing data is preserved — column values remain unchanged, only names update.
-- A new teacher_id column is added to reviews to preserve the origin-teacher audit trail.

-- reviews: teacher_id → admin_id, add nullable teacher_id for origin trace
ALTER TABLE reviews RENAME COLUMN teacher_id TO admin_id;
ALTER TABLE reviews ADD COLUMN teacher_id UUID NULL;
UPDATE reviews SET teacher_id = admin_id;
ALTER TABLE reviews ALTER COLUMN admin_id SET NOT NULL;

-- question_versions: edited_by_teacher_id → edited_by_admin_id
ALTER TABLE question_versions RENAME COLUMN edited_by_teacher_id TO edited_by_admin_id;

-- review_audit_log: teacher_id → admin_id
ALTER TABLE review_audit_log RENAME COLUMN teacher_id TO admin_id;

-- indexes
DROP INDEX IF EXISTS idx_reviews_teacher_id;
CREATE INDEX idx_reviews_admin_id ON reviews(admin_id);
CREATE INDEX idx_review_audit_log_admin_id ON review_audit_log(admin_id);
