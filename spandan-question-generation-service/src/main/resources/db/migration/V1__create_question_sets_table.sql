CREATE TABLE question_sets (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    transcript_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    attempt_number INTEGER NOT NULL,
    ai_provider VARCHAR(100),
    prompt_version VARCHAR(50),
    generation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    saved_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at TIMESTAMPTZ,
    UNIQUE (transcript_id, attempt_number)
);

CREATE INDEX idx_question_sets_session_id ON question_sets(session_id);
CREATE INDEX idx_question_sets_expiry_at ON question_sets(expiry_at) WHERE expiry_at IS NOT NULL AND saved_flag = FALSE;
