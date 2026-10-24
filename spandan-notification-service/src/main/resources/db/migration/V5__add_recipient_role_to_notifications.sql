ALTER TABLE notifications
    ADD COLUMN recipient_role VARCHAR(20) NOT NULL DEFAULT 'TEACHER';

CREATE INDEX idx_notifications_role_status ON notifications (recipient_role, status);
