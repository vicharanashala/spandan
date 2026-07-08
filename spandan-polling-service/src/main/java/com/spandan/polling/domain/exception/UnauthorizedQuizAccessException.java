package com.spandan.polling.domain.exception;

import java.util.UUID;

public class UnauthorizedQuizAccessException extends RuntimeException {
    public UnauthorizedQuizAccessException(UUID quizId, String userId) {
        super("User " + userId + " is not authorized for quiz " + quizId);
    }
}
