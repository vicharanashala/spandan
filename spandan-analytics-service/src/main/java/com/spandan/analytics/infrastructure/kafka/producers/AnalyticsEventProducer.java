package com.spandan.analytics.infrastructure.kafka.producers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
public class AnalyticsEventProducer {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventProducer.class);
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public AnalyticsEventProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publishAnalyticsCompleted(UUID quizId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "AnalyticsCompleted",
                "quizId", quizId.toString(),
                "generatedAt", Instant.now().toString()
        );
        kafkaTemplate.send("analytics-events", quizId.toString(), event);
        log.info("Published AnalyticsCompleted for quizId={}", quizId);
    }

    public void publishLeaderboardGenerated(UUID quizId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "LeaderboardGenerated",
                "quizId", quizId.toString(),
                "generatedAt", Instant.now().toString()
        );
        kafkaTemplate.send("analytics-events", quizId.toString(), event);
        log.info("Published LeaderboardGenerated for quizId={}", quizId);
    }

    public void publishStudentAnalyticsReady(UUID quizId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "StudentAnalyticsReady",
                "quizId", quizId.toString(),
                "generatedAt", Instant.now().toString()
        );
        kafkaTemplate.send("analytics-events", quizId.toString(), event);
    }

    public void publishTeacherAnalyticsReady(UUID quizId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "TeacherAnalyticsReady",
                "quizId", quizId.toString(),
                "generatedAt", Instant.now().toString()
        );
        kafkaTemplate.send("analytics-events", quizId.toString(), event);
    }
}
