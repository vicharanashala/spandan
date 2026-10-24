CREATE TABLE transcription_audit (
    audit_id UUID PRIMARY KEY,
    transcript_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    total_segments INTEGER,
    total_duration_ms BIGINT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_transcript_id ON transcription_audit(transcript_id);
CREATE INDEX idx_audit_timestamp ON transcription_audit(timestamp);
