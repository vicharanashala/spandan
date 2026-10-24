package com.spandan.polling.presentation.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record QuestionSlot(
        @NotNull UUID questionRefId,
        @Min(1) int sequencePosition,
        @Min(5) @Max(600) int timerDurationSeconds,
        UUID topicId,
        UUID conceptId,
        UUID learningObjectiveId,
        String difficulty,
        String questionType,
        String correctAnswer
) {}