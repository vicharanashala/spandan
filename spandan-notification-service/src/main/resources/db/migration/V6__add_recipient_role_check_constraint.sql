ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_role_check
    CHECK (recipient_role IN ('ADMIN', 'TEACHER', 'STUDENT'));
