CREATE TABLE question_analytics (
    id UUID PRIMARY KEY,
    quiz_id UUID NOT NULL,
    question_id UUID NOT NULL,
    responses_received INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    accuracy_pct DECIMAL(5,2) NOT NULL,
    average_response_time_seconds DECIMAL(6,2) NOT NULL,
    difficulty_score DECIMAL(5,2) NOT NULL,
    UNIQUE(quiz_id, question_id)
);

CREATE INDEX idx_question_analytics_quiz_id ON question_analytics(quiz_id);
