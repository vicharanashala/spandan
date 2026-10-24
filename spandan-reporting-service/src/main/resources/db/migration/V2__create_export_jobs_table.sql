CREATE TABLE export_jobs (
    id UUID PRIMARY KEY,
    report_id UUID NOT NULL,
    session_id UUID NOT NULL,
    format VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    file_path VARCHAR(1000),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE INDEX idx_export_jobs_session_id ON export_jobs(session_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE UNIQUE INDEX idx_export_jobs_session_format ON export_jobs(session_id, format);
