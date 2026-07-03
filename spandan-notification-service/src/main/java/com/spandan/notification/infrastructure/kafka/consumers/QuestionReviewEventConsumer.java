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
public class QuestionReviewEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionReviewEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public QuestionReviewEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.question-review-events}",
                   groupId = "${kafka.consumer.group-id}.qr",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            if (!"ReviewCompleted".equals(event.getEventType())) {
                log.debug("Ignored event type: {}", event.getEventType());
                return;
            }

            JsonNode payload = event.getPayload();
            UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());
            int approved = payload.get("approvedCount").asInt();
            int rejected = payload.get("rejectedCount").asInt();
            int orphaned = payload.get("orphanedCount").asInt();

            orchestrator.onReviewCompleted(event.getEventId().toString(), teacherId,
                    sessionId, approved, rejected, orphaned);
        } catch (Exception e) {
            log.error("Failed to process question-review event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
