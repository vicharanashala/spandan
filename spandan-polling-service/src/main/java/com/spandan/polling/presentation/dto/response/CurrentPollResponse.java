package com.spandan.polling.presentation.dto.response;

import java.util.UUID;

public record CurrentPollResponse(
        UUID quizId,
        int currentQuestionNumber,
        UUID questionId,
        String questionStatus,
        int remainingSeconds,
        String quizStatus
) {}
