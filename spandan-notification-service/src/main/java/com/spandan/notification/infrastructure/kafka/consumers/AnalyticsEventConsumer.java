package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.dto.event.EventEnvelope;
import com.spandan.notification.application.service.NotificationOrchestrator;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class AnalyticsEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public AnalyticsEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.analytics-events}",
                   groupId = "${kafka.consumer.group-id}.analytics",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            JsonNode payload = event.getPayload();
            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());
            UUID quizId = UUID.fromString(payload.get("quizId").asText());

            switch (event.getEventType()) {
                case "TeacherAnalyticsReady" -> {
                    UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
                    orchestrator.onTeacherAnalyticsReady(event.getEventId().toString(), teacherId, sessionId, quizId);
                }
                case "StudentAnalyticsReady" -> {
                    UUID studentId = UUID.fromString(payload.get("studentId").asText());
                    orchestrator.onStudentAnalyticsReady(event.getEventId().toString(), studentId, sessionId, quizId);
                }
                case "LeaderboardGenerated" -> {
                    orchestrator.onLeaderboardGenerated(event.getEventId().toString(), sessionId, quizId);
                }
                default -> log.debug("Ignored event type: {}", event.getEventType());
            }
        } catch (Exception e) {
            log.error("Failed to process analytics event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
