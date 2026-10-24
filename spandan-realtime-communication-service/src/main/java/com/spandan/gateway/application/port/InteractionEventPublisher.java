package com.spandan.gateway.application.port;

import java.time.Instant;

public interface InteractionEventPublisher {

    void questionDisplayed(String eventId, Instant eventTimestamp, String sessionId, String lectureId,
                           String studentId, String questionId, String sectionId, String subsectionId,
                           String topicId, String conceptId, Integer questionSequence, Instant questionDisplayedAt,
                           String adminId);

    void questionAnswered(String eventId, Instant eventTimestamp, String sessionId, String lectureId,
                          String studentId, String questionId, String selectedAnswer,
                          Instant questionDisplayedAt, Instant questionAnsweredAt, long responseTimeMilliseconds);

    void questionTimedOut(String eventId, Instant eventTimestamp, String sessionId, String lectureId,
                          String studentId, String questionId, Instant questionDisplayedAt,
                          Instant timeoutAt, long timeoutDurationMilliseconds);
}
