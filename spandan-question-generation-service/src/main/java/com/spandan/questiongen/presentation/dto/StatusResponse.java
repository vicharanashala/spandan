package com.spandan.questiongen.presentation.dto;

import com.spandan.questiongen.domain.entity.QuestionSet;
import com.spandan.questiongen.domain.enums.GenerationStatus;

import java.time.Instant;
import java.util.UUID;

public record StatusResponse(
    UUID id,
    GenerationStatus generationStatus,
    boolean savedFlag,
    Instant createdAt,
    Instant expiryAt,
    int questionCount
) {
    public static StatusResponse from(QuestionSet entity, int questionCount) {
        return new StatusResponse(
            entity.getId(),
            entity.getGenerationStatus(),
            entity.isSavedFlag(),
            entity.getCreatedAt(),
            entity.getExpiryAt(),
            questionCount
        );
    }
}
