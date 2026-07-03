package com.spandan.polling.presentation.dto.response;

import java.time.Instant;
import java.util.UUID;

public record QuizResponse(
        UUID id,
        String quizStatus,
        int currentQuestionNumber,
        int totalQuestions,
        Instant createdAt
) {}
