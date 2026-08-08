package com.spandan.polling.domain.exception;

import java.util.UUID;

public class QuestionNotFoundException extends RuntimeException {
    public QuestionNotFoundException(UUID questionId) {
        super("Question not found: " + questionId);
    }
}
