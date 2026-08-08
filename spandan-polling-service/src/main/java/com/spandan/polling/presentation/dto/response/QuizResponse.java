package com.spandan.polling.presentation.dto.response;

import java.time.Instant;
import java.util.UUID;

public record QuizResponse(
        UUID id,
        UUID adminId,
        UUID teacherId,
        String quizStatus,
        int currentQuestionNumber,
        int totalQuestions,
        UUID lectureId,
        UUID sectionId,
        UUID subsectionId,
        Instant createdAt
) {}
