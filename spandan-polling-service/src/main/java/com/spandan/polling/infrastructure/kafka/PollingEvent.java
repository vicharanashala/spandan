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
        String correctAnswer,
        UUID sessionId,
        UUID adminId
) {
    public PollingEvent(UUID eventId, String eventType, UUID quizId, UUID questionId,
                        UUID questionRefId, Integer sequencePosition, Instant occurredAt,
                        Integer timerDurationSeconds, Integer totalQuestions) {
        this(eventId, eventType, quizId, questionId, questionRefId, sequencePosition,
                occurredAt, timerDurationSeconds, totalQuestions,
                null, null, null, null, null, null, null, null, null, null, null, null);
    }

    public PollingEvent(UUID eventId, String eventType, UUID quizId, UUID questionId,
                        UUID questionRefId, Integer sequencePosition, Instant occurredAt,
                        Integer timerDurationSeconds, Integer totalQuestions,
                        UUID teacherId, UUID lectureId, UUID sectionId, UUID subsectionId,
                        UUID topicId, UUID conceptId, UUID learningObjectiveId,
                        String difficulty, String questionType, String correctAnswer,
                        UUID sessionId) {
        this(eventId, eventType, quizId, questionId, questionRefId, sequencePosition,
                occurredAt, timerDurationSeconds, totalQuestions,
                teacherId, lectureId, sectionId, subsectionId,
                topicId, conceptId, learningObjectiveId,
                difficulty, questionType, correctAnswer, sessionId, null);
    }
}
