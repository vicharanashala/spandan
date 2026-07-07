CREATE TABLE reports (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    teacher_id UUID,
    analytics_type VARCHAR(50) NOT NULL,
    report_data JSONB,
    summary JSONB,
    generated_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    version INT NOT NULL DEFAULT 1,
    size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, analytics_type)
);

CREATE INDEX idx_reports_session_id ON reports(session_id);
CREATE INDEX idx_reports_teacher_id ON reports(teacher_id);
CREATE INDEX idx_reports_analytics_type ON reports(analytics_type);
CREATE INDEX idx_reports_generated_at ON reports(generated_at);
