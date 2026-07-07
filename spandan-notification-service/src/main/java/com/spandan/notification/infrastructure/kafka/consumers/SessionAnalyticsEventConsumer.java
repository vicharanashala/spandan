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
public class SessionAnalyticsEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(SessionAnalyticsEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public SessionAnalyticsEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.session-analytics-events}",
                   groupId = "${kafka.consumer.group-id}.session-analytics",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            if (!"SessionAnalyticsCompletedEvent".equals(event.getEventType())) {
                log.debug("Ignored event type: {}", event.getEventType());
                return;
            }

            JsonNode payload = event.getPayload();
            String eventId = event.getEventId().toString();
            UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());

            orchestrator.onSessionAnalyticsCompleted(eventId, teacherId, sessionId);
        } catch (Exception e) {
            log.error("Failed to process session-analytics event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
