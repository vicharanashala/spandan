package com.spandan.response.presentation.dto;

import com.spandan.response.domain.entity.Interaction;
import java.time.Instant;
import java.util.UUID;

public record InteractionResponse(
    UUID id,
    UUID eventId,
    String eventType,
    Instant eventTimestamp,
    UUID sessionId,
    UUID lectureId,
    UUID studentId,
    UUID questionId,
    UUID sectionId,
    UUID subsectionId,
    UUID topicId,
    UUID conceptId,
    String learningObjective,
    String questionType,
    String difficulty,
    Integer questionSequence,
    Instant questionDisplayedAt,
    Instant questionAnsweredAt,
    Long responseTimeMs,
    String selectedAnswer,
    String correctAnswer,
    Boolean isCorrect,
    Boolean answered,
    Boolean timeout,
    String eventVersion,
    Instant createdAt
) {
    public static InteractionResponse from(Interaction entity) {
        return new InteractionResponse(
            entity.getId(), entity.getEventId(), entity.getEventType(), entity.getEventTimestamp(),
            entity.getSessionId(), entity.getLectureId(), entity.getStudentId(), entity.getQuestionId(),
            entity.getSectionId(), entity.getSubsectionId(), entity.getTopicId(), entity.getConceptId(),
            entity.getLearningObjective(), entity.getQuestionType(), entity.getDifficulty(),
            entity.getQuestionSequence(), entity.getQuestionDisplayedAt(), entity.getQuestionAnsweredAt(),
            entity.getResponseTimeMs(), entity.getSelectedAnswer(), entity.getCorrectAnswer(),
            entity.getIsCorrect(), entity.getAnswered(), entity.getTimeout(),
            entity.getEventVersion(), entity.getCreatedAt()
        );
    }
}
