CREATE TABLE generated_questions (
    id UUID PRIMARY KEY,
    question_set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    question_type VARCHAR(20) NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer TEXT NOT NULL,
    review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW'
);

CREATE INDEX idx_generated_questions_set_id ON generated_questions(question_set_id);
