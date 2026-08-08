package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
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
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID lectureId = UUID.fromString(event.get("lectureId").toString());
            UUID sessionId = event.containsKey("sessionId") && event.get("sessionId") != null
                    ? UUID.fromString(event.get("sessionId").toString()) : null;

            switch (eventType) {
                case "LectureCreated" -> {
                    UUID teacherId = UUID.fromString(event.get("teacherId").toString());
                    orchestrator.onLectureCreated(eventId, teacherId, lectureId, sessionId);
                }
                case "LectureStarted" -> {
                    UUID userId = UUID.fromString(event.get("userId").toString());
                    orchestrator.onLectureStarted(eventId, userId, lectureId, sessionId);
                }
                case "LectureEnded" -> {
                    UUID teacherId = UUID.fromString(event.get("teacherId").toString());
                    orchestrator.onLectureEnded(eventId, teacherId, lectureId, sessionId);
                }
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process lecture event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
