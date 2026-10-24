CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_ref_id UUID NOT NULL,
    sequence_position INT NOT NULL,
    question_status VARCHAR(20) NOT NULL CHECK (question_status IN ('SCHEDULED', 'PUBLISHED', 'RUNNING', 'TIMER_EXPIRED', 'CLOSED', 'CANCELLED')),
    timer_duration_seconds INT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (quiz_id, sequence_position)
);

CREATE INDEX idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX idx_quiz_questions_status ON quiz_questions(question_status);
