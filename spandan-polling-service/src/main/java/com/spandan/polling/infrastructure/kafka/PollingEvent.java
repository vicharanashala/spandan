package com.spandan.polling.infrastructure.kafka;

import java.time.Instant;
import java.util.UUID;

public record PollingEvent(
        UUID eventId,
        String eventType,
        UUID quizId,
        UUID questionId,
        UUID questionRefId,
        Integer sequencePosition,
        Instant occurredAt,
        Integer timerDurationSeconds,
        Integer totalQuestions,
        UUID teacherId,
        UUID lectureId,
        UUID sectionId,
        UUID subsectionId,
        UUID topicId,
        UUID conceptId,
        UUID learningObjectiveId,
        String difficulty,
        String questionType,
        String correctAnswer
) {
    public PollingEvent(UUID eventId, String eventType, UUID quizId, UUID questionId,
                        UUID questionRefId, Integer sequencePosition, Instant occurredAt,
                        Integer timerDurationSeconds, Integer totalQuestions) {
        this(eventId, eventType, quizId, questionId, questionRefId, sequencePosition,
                occurredAt, timerDurationSeconds, totalQuestions,
                null, null, null, null, null, null, null, null, null, null);
    }
}
