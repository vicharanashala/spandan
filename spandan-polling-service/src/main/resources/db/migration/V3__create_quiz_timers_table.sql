CREATE TABLE quiz_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    timer_status VARCHAR(20) NOT NULL CHECK (timer_status IN ('NOT_STARTED', 'RUNNING', 'PAUSED', 'EXPIRED')),
    duration_seconds INT NOT NULL,
    remaining_seconds INT NOT NULL,
    timer_started_at TIMESTAMP WITH TIME ZONE,
    timer_paused_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (quiz_question_id)
);

CREATE INDEX idx_quiz_timers_status ON quiz_timers(timer_status);
