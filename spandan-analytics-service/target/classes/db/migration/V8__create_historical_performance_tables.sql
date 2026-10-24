CREATE TABLE historical_student_performance (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL UNIQUE,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    average_accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    average_participation_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    accuracy_trend VARCHAR(20) NOT NULL DEFAULT 'STABLE',
    participation_trend VARCHAR(20) NOT NULL DEFAULT 'STABLE',
    average_response_time_ms BIGINT NOT NULL DEFAULT 0,
    last_session_accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    last_session_response_time_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historical_student ON historical_student_performance(student_id);

CREATE TABLE historical_concept_performance (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL,
    concept_id VARCHAR(255) NOT NULL,
    concept_name VARCHAR(500),
    total_attempts INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    mastery_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    sessions_covered INTEGER NOT NULL DEFAULT 0,
    last_accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, concept_id)
);

CREATE INDEX idx_historical_concept_student ON historical_concept_performance(student_id);
CREATE INDEX idx_historical_concept_id ON historical_concept_performance(concept_id);
