package com.spandan.polling.domain.exception;

import java.util.UUID;

public class UnauthorizedQuizAccessException extends RuntimeException {
    public UnauthorizedQuizAccessException(UUID quizId, UUID teacherId) {
        super("Teacher " + teacherId + " does not own quiz " + quizId);
    }
}
