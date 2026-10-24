CREATE TABLE session_analytics (
    id UUID PRIMARY KEY,
    quiz_id UUID NOT NULL UNIQUE,
    total_questions INTEGER NOT NULL,
    total_students INTEGER NOT NULL,
    overall_class_accuracy DECIMAL(5,2) NOT NULL,
    overall_participation_rate DECIMAL(5,2) NOT NULL,
    average_response_time_seconds DECIMAL(6,2) NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
