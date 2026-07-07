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
public class LectureEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(LectureEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public LectureEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.lecture-events}",
                   groupId = "${kafka.consumer.group-id}.lecture",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            JsonNode payload = event.getPayload();
            String eventId = event.getEventId().toString();
            UUID lectureId = UUID.fromString(payload.get("lectureId").asText());
            UUID sessionId = payload.has("sessionId") && !payload.get("sessionId").isNull()
                    ? UUID.fromString(payload.get("sessionId").asText()) : null;

            switch (event.getEventType()) {
                case "LectureCreated" -> {
                    UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
                    orchestrator.onLectureCreated(eventId, teacherId, lectureId, sessionId);
                }
                case "LectureStarted" -> {
                    UUID userId = UUID.fromString(payload.get("userId").asText());
                    orchestrator.onLectureStarted(eventId, userId, lectureId, sessionId);
                }
                case "LectureEnded" -> {
                    UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
                    orchestrator.onLectureEnded(eventId, teacherId, lectureId, sessionId);
                }
                default -> log.debug("Ignored event type: {}", event.getEventType());
            }
        } catch (Exception e) {
            log.error("Failed to process lecture event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
