CREATE TABLE question_versions (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id),
    version_number INT NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer TEXT NOT NULL,
    edited_by_teacher_id UUID,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_question_versions UNIQUE (review_id, version_number)
);

CREATE INDEX idx_question_versions_review_id ON question_versions(review_id);
