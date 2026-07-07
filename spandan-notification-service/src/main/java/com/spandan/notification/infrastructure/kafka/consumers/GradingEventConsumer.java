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
public class GradingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(GradingEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public GradingEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.grading-events}",
                   groupId = "${kafka.consumer.group-id}.grading",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            JsonNode payload = event.getPayload();
            String eventId = event.getEventId().toString();
            UUID userId = UUID.fromString(payload.get("userId").asText());
            UUID sessionId = payload.has("sessionId") && !payload.get("sessionId").isNull()
                    ? UUID.fromString(payload.get("sessionId").asText()) : null;
            UUID quizId = payload.has("quizId") && !payload.get("quizId").isNull()
                    ? UUID.fromString(payload.get("quizId").asText()) : null;

            switch (event.getEventType()) {
                case "GradingCompleted" ->
                    orchestrator.onGradingCompleted(eventId, userId, sessionId, quizId);
                case "AutoGradingFailed" -> {
                    String reason = payload.get("failureReason").asText();
                    orchestrator.onAutoGradingFailed(eventId, userId, sessionId, quizId, reason);
                }
                default -> log.debug("Ignored event type: {}", event.getEventType());
            }
        } catch (Exception e) {
            log.error("Failed to process grading event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
