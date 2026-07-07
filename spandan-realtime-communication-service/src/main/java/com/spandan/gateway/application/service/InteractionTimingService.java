package com.spandan.gateway.application.service;

import com.spandan.gateway.application.port.InteractionEventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;

@Service
public class InteractionTimingService {

    private static final Logger log = LoggerFactory.getLogger(InteractionTimingService.class);

    private static final String DISPLAY_KEY_PREFIX = "question:%s:displayed";

    private final StringRedisTemplate redisTemplate;
    private final InteractionEventPublisher eventPublisher;
    private final long gracePeriodSeconds;

    public InteractionTimingService(StringRedisTemplate redisTemplate,
                                    InteractionEventPublisher eventPublisher,
                                    @Value("${rtc.poll-grace-period-seconds:30}") long gracePeriodSeconds) {
        this.redisTemplate = redisTemplate;
        this.eventPublisher = eventPublisher;
        this.gracePeriodSeconds = gracePeriodSeconds;
    }

    public boolean recordQuestionDisplayed(String sessionId, String lectureId, String studentId,
                                           String questionId, String sectionId, String subsectionId,
                                           String topicId, String conceptId, Integer questionSequence,
                                           Instant displayedAt) {
        String key = DISPLAY_KEY_PREFIX.formatted(questionId);
        long epochMs = displayedAt.toEpochMilli();

        Boolean added = redisTemplate.opsForZSet().addIfAbsent(key, studentId, epochMs);
        if (Boolean.TRUE.equals(added)) {
            redisTemplate.expire(key, Duration.ofSeconds(gracePeriodSeconds));
            String eventId = UUID.randomUUID().toString();
            eventPublisher.questionDisplayed(eventId, Instant.now(), sessionId, lectureId, studentId,
                    questionId, sectionId, subsectionId, topicId, conceptId, questionSequence, displayedAt);
            return true;
        }
        return false;
    }

    public OptionalLong processAnswer(String sessionId, String lectureId, String studentId,
                                      String questionId, String selectedAnswer) {
        String key = DISPLAY_KEY_PREFIX.formatted(questionId);
        Double displayEpochMs = redisTemplate.opsForZSet().score(key, studentId);
        if (displayEpochMs == null) {
            return OptionalLong.empty();
        }

        Instant displayedAt = Instant.ofEpochMilli(displayEpochMs.longValue());
        Instant answeredAt = Instant.now();
        long responseTimeMs = answeredAt.toEpochMilli() - displayEpochMs.longValue();
        redisTemplate.opsForZSet().remove(key, studentId);

        String eventId = UUID.randomUUID().toString();
        eventPublisher.questionAnswered(eventId, answeredAt, sessionId, lectureId, studentId,
                questionId, selectedAnswer, displayedAt, answeredAt, responseTimeMs);
        return OptionalLong.of(responseTimeMs);
    }

    public int checkAndProcessTimeouts(String questionId, long pollDurationMs) {
        String key = DISPLAY_KEY_PREFIX.formatted(questionId);
        long cutoffEpochMs = Instant.now().toEpochMilli() - pollDurationMs;

        Set<String> expiredStudents = redisTemplate.opsForZSet()
                .rangeByScore(key, 0, cutoffEpochMs);

        if (expiredStudents == null || expiredStudents.isEmpty()) {
            return 0;
        }

        int count = 0;
        for (String studentId : expiredStudents) {
            Double displayEpochMs = redisTemplate.opsForZSet().score(key, studentId);
            if (displayEpochMs == null) continue;

            Instant displayedAt = Instant.ofEpochMilli(displayEpochMs.longValue());
            Instant timeoutAt = Instant.now();
            long timeoutDurationMs = timeoutAt.toEpochMilli() - displayEpochMs.longValue();

            String eventId = UUID.randomUUID().toString();
            eventPublisher.questionTimedOut(eventId, timeoutAt, null, null, studentId,
                    questionId, displayedAt, timeoutAt, timeoutDurationMs);
            redisTemplate.opsForZSet().remove(key, studentId);
            count++;
        }
        return count;
    }

    public int forceTimeoutRemaining(String sessionId, String lectureId, String questionId) {
        String key = DISPLAY_KEY_PREFIX.formatted(questionId);
        Set<String> students = redisTemplate.opsForZSet().range(key, 0, -1);

        if (students == null || students.isEmpty()) {
            redisTemplate.delete(key);
            return 0;
        }

        int count = 0;
        for (String studentId : students) {
            Double displayEpochMs = redisTemplate.opsForZSet().score(key, studentId);
            if (displayEpochMs == null) continue;

            Instant displayedAt = Instant.ofEpochMilli(displayEpochMs.longValue());
            Instant timeoutAt = Instant.now();
            long timeoutDurationMs = timeoutAt.toEpochMilli() - displayEpochMs.longValue();

            String eventId = UUID.randomUUID().toString();
            eventPublisher.questionTimedOut(eventId, timeoutAt, sessionId, lectureId, studentId,
                    questionId, displayedAt, timeoutAt, timeoutDurationMs);
            redisTemplate.opsForZSet().remove(key, studentId);
            count++;
        }
        redisTemplate.delete(key);
        return count;
    }
}
