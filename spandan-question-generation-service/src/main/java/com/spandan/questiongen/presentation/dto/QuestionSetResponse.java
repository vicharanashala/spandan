package com.spandan.questiongen.presentation.dto;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.entity.QuestionSet;
import com.spandan.questiongen.domain.enums.GenerationStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record QuestionSetResponse(
    UUID id,
    UUID sessionId,
    UUID transcriptId,
    UUID teacherId,
    int attemptNumber,
    String aiProvider,
    String promptVersion,
    GenerationStatus generationStatus,
    boolean savedFlag,
    Instant createdAt,
    Instant expiryAt,
    List<GeneratedQuestionResponse> questions
) {
    public static QuestionSetResponse from(QuestionSet entity) {
        return new QuestionSetResponse(
            entity.getId(),
            entity.getSessionId(),
            entity.getTranscriptId(),
            entity.getTeacherId(),
            entity.getAttemptNumber(),
            entity.getAiProvider(),
            entity.getPromptVersion(),
            entity.getGenerationStatus(),
            entity.isSavedFlag(),
            entity.getCreatedAt(),
            entity.getExpiryAt(),
            entity.getQuestions().stream().map(GeneratedQuestionResponse::from).toList()
        );
    }
}
