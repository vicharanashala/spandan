CREATE TABLE interactions (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(20) NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    session_id UUID NOT NULL,
    lecture_id UUID,
    student_id UUID NOT NULL,
    question_id UUID NOT NULL,
    section_id UUID,
    subsection_id UUID,
    topic_id UUID,
    concept_id UUID,
    learning_objective VARCHAR(500),
    question_type VARCHAR(20),
    difficulty VARCHAR(10),
    question_sequence INT,
    question_displayed_at TIMESTAMPTZ,
    question_answered_at TIMESTAMPTZ,
    response_time_ms BIGINT,
    selected_answer VARCHAR(500),
    correct_answer VARCHAR(500),
    is_correct BOOLEAN,
    answered BOOLEAN NOT NULL DEFAULT FALSE,
    timeout BOOLEAN NOT NULL DEFAULT FALSE,
    event_version VARCHAR(10) DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_interactions_event_id ON interactions(event_id);
CREATE INDEX idx_interactions_session ON interactions(session_id);
CREATE INDEX idx_interactions_student ON interactions(student_id);
CREATE INDEX idx_interactions_question ON interactions(question_id);
CREATE INDEX idx_interactions_lecture ON interactions(lecture_id);
CREATE INDEX idx_interactions_session_student ON interactions(session_id, student_id);

CREATE TABLE question_metadata (
    id UUID PRIMARY KEY,
    question_id UUID NOT NULL UNIQUE,
    correct_answer VARCHAR(500),
    question_type VARCHAR(20),
    difficulty VARCHAR(10),
    lecture_id UUID,
    section_id UUID,
    subsection_id UUID,
    topic_id UUID,
    concept_id UUID,
    learning_objective VARCHAR(500),
    question_sequence INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_metadata_question_id ON question_metadata(question_id);

CREATE TABLE raw_events (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(20) NOT NULL,
    event_payload JSONB NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raw_events_event_id ON raw_events(event_id);
CREATE INDEX idx_raw_events_event_type ON raw_events(event_type);
