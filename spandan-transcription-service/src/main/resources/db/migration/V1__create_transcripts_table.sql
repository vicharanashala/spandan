CREATE TABLE transcripts (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL UNIQUE,
    stream_id UUID NOT NULL,
    transcript_text TEXT,
    processing_status VARCHAR(20) NOT NULL CHECK (processing_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
    total_segments INTEGER,
    total_duration_ms BIGINT,
    failure_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_transcripts_session_id ON transcripts(session_id);
CREATE INDEX idx_transcripts_expiry_at ON transcripts(expiry_at);
CREATE INDEX idx_transcripts_status ON transcripts(processing_status);
