package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class GradingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(GradingEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public GradingEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.grading-events}",
                   groupId = "${kafka.consumer.group-id}.grading",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID adminId = event.containsKey("adminId") && event.get("adminId") != null
                    ? UUID.fromString(event.get("adminId").toString())
                    : UUID.fromString(event.get("userId").toString());
            UUID sessionId = event.containsKey("sessionId") && event.get("sessionId") != null
                    ? UUID.fromString(event.get("sessionId").toString()) : null;
            UUID quizId = event.containsKey("quizId") && event.get("quizId") != null
                    ? UUID.fromString(event.get("quizId").toString()) : null;

            switch (eventType) {
                case "GradingCompleted" ->
                    orchestrator.onGradingCompleted(eventId, adminId, sessionId, quizId);
                case "AutoGradingFailed" -> {
                    String reason = (String) event.get("failureReason");
                    orchestrator.onAutoGradingFailed(eventId, adminId, sessionId, quizId, reason);
                }
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process grading event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
