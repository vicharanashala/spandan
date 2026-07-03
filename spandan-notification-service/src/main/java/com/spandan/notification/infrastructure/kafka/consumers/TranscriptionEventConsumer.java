package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class TranscriptionEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionEventConsumer.class);

    private final NotificationOrchestrator orchestrator;
    private final ObjectMapper objectMapper;

    public TranscriptionEventConsumer(NotificationOrchestrator orchestrator, ObjectMapper objectMapper) {
        this.orchestrator = orchestrator;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${kafka.topics.transcription-events}",
                   groupId = "${kafka.consumer.group-id}.transcription",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            if (!"TranscriptGenerationFailed".equals(event.get("eventType"))
                    && !"TranscriptGenerationFailed".equals(event.get("type"))) {
                log.debug("Ignored event type: {}", event.get("eventType"));
                return;
            }

            Object rawPayload = event.get("payload");
            JsonNode payload;
            if (rawPayload instanceof Map) {
                payload = objectMapper.valueToTree(rawPayload);
            } else {
                payload = objectMapper.valueToTree(event);
            }

            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());
            String reason = payload.get("failureReason").asText();
            UUID teacherId = null;
            if (payload.has("teacherId") && !payload.get("teacherId").isNull()) {
                teacherId = UUID.fromString(payload.get("teacherId").asText());
            } else if (payload.has("userId") && !payload.get("userId").isNull()) {
                teacherId = UUID.fromString(payload.get("userId").asText());
            }

            if (teacherId == null) {
                log.warn("teacherId missing from TranscriptGenerationFailed event for sessionId={} — skipping notification", sessionId);
                return;
            }

            String eventId = event.containsKey("eventId")
                    ? event.get("eventId").toString()
                    : UUID.randomUUID().toString();

            orchestrator.onTranscriptGenerationFailed(eventId, teacherId, sessionId, reason);
        } catch (Exception e) {
            log.error("Failed to process transcription event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
