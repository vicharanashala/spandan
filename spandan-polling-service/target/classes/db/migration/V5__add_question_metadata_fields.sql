ALTER TABLE quiz_questions
    ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20),
    ADD COLUMN IF NOT EXISTS question_type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS correct_answer VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_question_type ON quiz_questions(question_type);
