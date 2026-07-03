package com.spandan.polling.presentation.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record QuizDetailResponse(
        UUID id,
        UUID teacherId,
        String quizStatus,
        int currentQuestionNumber,
        int totalQuestions,
        Instant startedAt,
        Instant endedAt,
        List<QuestionSummary> questions,
        Instant createdAt
) {
    public record QuestionSummary(
            UUID id,
            int sequencePosition,
            String questionStatus,
            int timerDurationSeconds
    ) {}
}
