package com.spandan.response.presentation.dto;

import java.util.UUID;

public record SessionSummaryResponse(
    UUID sessionId,
    long totalInteractions,
    long totalAnswered,
    long totalTimedOut,
    long totalCorrect,
    long totalIncorrect
) {}
