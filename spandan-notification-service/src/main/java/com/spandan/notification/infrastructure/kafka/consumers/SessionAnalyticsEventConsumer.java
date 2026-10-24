package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
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
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            if (!"SessionAnalyticsCompletedEvent".equals(eventType)) {
                log.debug("Ignored event type: {}", eventType);
                return;
            }

            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID sessionId = UUID.fromString(event.get("sessionId").toString());

            Object teacherIdObj = event.get("teacherId");
            if (teacherIdObj == null) {
                log.warn("SessionAnalyticsCompletedEvent missing teacherId for sessionId={}, skipping notification", sessionId);
                return;
            }
            UUID teacherId = UUID.fromString(teacherIdObj.toString());

            orchestrator.onSessionAnalyticsCompleted(eventId, teacherId, sessionId);
        } catch (Exception e) {
            log.error("Failed to process session-analytics event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
