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
        Integer totalQuestions
) {}
