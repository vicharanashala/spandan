CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    channel VARCHAR(20) NOT NULL,
    source_service VARCHAR(50) NOT NULL,
    source_event_id UUID NOT NULL,
    session_id UUID,
    quiz_id UUID,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications
    ADD CONSTRAINT uq_notification_dedup UNIQUE (source_event_id, user_id, notification_type);

CREATE INDEX idx_notifications_user_status ON notifications (user_id, status);
CREATE INDEX idx_notifications_retry ON notifications (status, next_retry_at)
    WHERE status = 'FAILED' AND retry_count < 5;
CREATE INDEX idx_notifications_created ON notifications (created_at DESC);
