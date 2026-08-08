CREATE TABLE learning_objective_mastery (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    student_id UUID NOT NULL,
    learning_objective VARCHAR(500) NOT NULL,
    questions_attempted INT NOT NULL DEFAULT 0,
    questions_correct INT NOT NULL DEFAULT 0,
    mastery_pct DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    UNIQUE(session_id, student_id, learning_objective)
);

CREATE INDEX idx_lo_mastery_session ON learning_objective_mastery(session_id);
CREATE INDEX idx_lo_mastery_student ON learning_objective_mastery(student_id);
CREATE INDEX idx_lo_mastery_objective ON learning_objective_mastery(learning_objective);
