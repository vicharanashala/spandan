CREATE TABLE stream_sessions (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL UNIQUE,
    teacher_id UUID NOT NULL,
    lecture_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    audio_format VARCHAR(20) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    ws_endpoint VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at TIMESTAMPTZ,
    duration_ms BIGINT,
    chunks_sent INT NOT NULL DEFAULT 0,
    chunks_dropped INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stream_sessions_session ON stream_sessions (session_id);
CREATE INDEX idx_stream_sessions_teacher ON stream_sessions (teacher_id);
CREATE INDEX idx_stream_sessions_status ON stream_sessions (status);
