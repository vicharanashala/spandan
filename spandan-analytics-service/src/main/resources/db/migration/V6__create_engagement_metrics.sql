CREATE TABLE engagement_metrics (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    response_time_trend VARCHAR(20) NOT NULL DEFAULT 'STABLE',
    timeout_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    participation_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    engagement_level VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    total_answered INT NOT NULL DEFAULT 0,
    total_displayed INT NOT NULL DEFAULT 0,
    UNIQUE(session_id, student_id)
);

CREATE INDEX idx_engagement_session ON engagement_metrics(session_id);
CREATE INDEX idx_engagement_student ON engagement_metrics(student_id);
