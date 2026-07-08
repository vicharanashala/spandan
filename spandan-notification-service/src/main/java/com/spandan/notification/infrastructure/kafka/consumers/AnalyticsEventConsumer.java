package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class AnalyticsEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventConsumer.class);

    private final NotificationOrchestrator orchestrator;
    private final ObjectMapper objectMapper;

    public AnalyticsEventConsumer(NotificationOrchestrator orchestrator, ObjectMapper objectMapper) {
        this.orchestrator = orchestrator;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${kafka.topics.analytics-events}",
                   groupId = "${kafka.consumer.group-id}.analytics",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID sessionId = UUID.fromString(event.get("sessionId").toString());
            UUID quizId = UUID.fromString(event.get("quizId").toString());

            switch (eventType) {
                case "TeacherAnalyticsReady" -> {
                    UUID teacherId = UUID.fromString(event.get("teacherId").toString());
                    orchestrator.onTeacherAnalyticsReady(eventId, teacherId, sessionId, quizId);
                }
                case "StudentAnalyticsReady" -> {
                    UUID studentId = UUID.fromString(event.get("studentId").toString());
                    orchestrator.onStudentAnalyticsReady(eventId, studentId, sessionId, quizId);
                }
                case "LeaderboardGenerated" -> {
                    orchestrator.onLeaderboardGenerated(eventId, sessionId, quizId);
                }
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process analytics event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
