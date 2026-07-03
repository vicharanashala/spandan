CREATE TABLE student_performance (
    id UUID PRIMARY KEY,
    quiz_id UUID NOT NULL,
    student_id UUID NOT NULL,
    total_answered INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    accuracy_pct DECIMAL(5,2) NOT NULL,
    total_score DECIMAL(8,2) NOT NULL,
    average_response_time_seconds DECIMAL(6,2) NOT NULL,
    UNIQUE(quiz_id, student_id)
);

CREATE INDEX idx_student_performance_student_id ON student_performance(student_id);
