CREATE TABLE student_features (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    total_questions_displayed INTEGER NOT NULL DEFAULT 0,
    total_answered INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_incorrect INTEGER NOT NULL DEFAULT 0,
    total_timed_out INTEGER NOT NULL DEFAULT 0,
    participation_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    average_response_time_ms BIGINT NOT NULL DEFAULT 0,
    response_time_consistency DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    timeout_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, student_id)
);

CREATE INDEX idx_student_features_session ON student_features(session_id);
CREATE INDEX idx_student_features_student ON student_features(student_id);

CREATE TABLE educational_features (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    educational_level VARCHAR(50) NOT NULL,
    educational_id VARCHAR(255),
    educational_name VARCHAR(500),
    questions_attempted INTEGER NOT NULL DEFAULT 0,
    questions_correct INTEGER NOT NULL DEFAULT 0,
    accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    average_response_time_ms BIGINT NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, student_id, educational_level, educational_id)
);

CREATE INDEX idx_educational_features_session ON educational_features(session_id);
CREATE INDEX idx_educational_features_student ON educational_features(student_id);
CREATE INDEX idx_educational_features_level ON educational_features(educational_level);

CREATE TABLE session_features (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL UNIQUE,
    questions_attempted INTEGER NOT NULL DEFAULT 0,
    questions_skipped INTEGER NOT NULL DEFAULT 0,
    completion_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    total_students INTEGER NOT NULL DEFAULT 0,
    total_interactions INTEGER NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_features_session ON session_features(session_id);
