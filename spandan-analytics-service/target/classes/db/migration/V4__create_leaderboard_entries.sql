CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY,
    quiz_id UUID NOT NULL,
    student_id UUID NOT NULL,
    rank INTEGER NOT NULL,
    total_score DECIMAL(8,2) NOT NULL,
    accuracy_pct DECIMAL(5,2) NOT NULL,
    UNIQUE(quiz_id, student_id),
    UNIQUE(quiz_id, rank)
);

CREATE INDEX idx_leaderboard_quiz_rank ON leaderboard_entries(quiz_id, rank);
