ALTER TABLE question_sets ADD COLUMN lecture_id UUID;

ALTER TABLE generated_questions
    ADD COLUMN lecture_id UUID,
    ADD COLUMN section_id UUID,
    ADD COLUMN subsection_id UUID,
    ADD COLUMN topic_id UUID,
    ADD COLUMN concept_id UUID,
    ADD COLUMN learning_objective VARCHAR(500),
    ADD COLUMN difficulty VARCHAR(10) DEFAULT 'MEDIUM',
    ADD COLUMN question_sequence INT,
    ADD COLUMN generated_at TIMESTAMPTZ,
    ADD COLUMN generation_model VARCHAR(50),
    ADD COLUMN generation_version VARCHAR(50);

CREATE INDEX idx_generated_questions_lecture_id ON generated_questions(lecture_id);
