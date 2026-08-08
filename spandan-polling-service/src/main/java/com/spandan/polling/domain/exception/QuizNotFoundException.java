package com.spandan.polling.domain.exception;

import java.util.UUID;

public class QuizNotFoundException extends RuntimeException {
    public QuizNotFoundException(UUID quizId) {
        super("Quiz not found: " + quizId);
    }
}
