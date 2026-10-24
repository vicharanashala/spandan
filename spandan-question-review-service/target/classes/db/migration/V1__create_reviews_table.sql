CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    question_id UUID NOT NULL,
    question_set_id UUID NOT NULL,
    session_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    original_ai_question TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL,
    edited_question TEXT,
    edited_options JSONB,
    edited_correct_answer TEXT,
    review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
    review_comments TEXT,
    question_order INT,
    saved_flag BOOLEAN NOT NULL DEFAULT FALSE,
    version INT NOT NULL DEFAULT 0,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_review_status CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ORPHANED')),
    CONSTRAINT uq_reviews_question_id UNIQUE (question_id),
    CONSTRAINT uq_reviews_set_order UNIQUE (question_set_id, question_order)
);

CREATE INDEX idx_reviews_question_set_id ON reviews(question_set_id);
CREATE INDEX idx_reviews_teacher_id ON reviews(teacher_id);
CREATE INDEX idx_reviews_status ON reviews(review_status);
