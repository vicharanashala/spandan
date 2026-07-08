ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS lecture_id UUID,
    ADD COLUMN IF NOT EXISTS section_id UUID,
    ADD COLUMN IF NOT EXISTS subsection_id UUID;

ALTER TABLE quiz_questions
    ADD COLUMN IF NOT EXISTS lecture_id UUID,
    ADD COLUMN IF NOT EXISTS section_id UUID,
    ADD COLUMN IF NOT EXISTS subsection_id UUID,
    ADD COLUMN IF NOT EXISTS topic_id UUID,
    ADD COLUMN IF NOT EXISTS concept_id UUID,
    ADD COLUMN IF NOT EXISTS learning_objective_id UUID;

ALTER TABLE quiz_questions
    ADD COLUMN IF NOT EXISTS poll_opened_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS poll_closed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE quiz_questions
    DROP CONSTRAINT IF EXISTS quiz_questions_question_status_check;

ALTER TABLE quiz_questions
    ADD CONSTRAINT quiz_questions_question_status_check
        CHECK (question_status IN ('SCHEDULED', 'PUBLISHED', 'POLL_OPEN', 'RUNNING', 'TIMER_EXPIRED', 'CLOSED', 'POLL_CLOSED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_quiz_questions_lecture_id ON quiz_questions(lecture_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_topic_id ON quiz_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_lecture_id ON quizzes(lecture_id);
