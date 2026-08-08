package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
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
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            if (!"ReviewCompleted".equals(eventType)) {
                log.debug("Ignored event type: {}", eventType);
                return;
            }

            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID adminId = event.containsKey("adminId") && event.get("adminId") != null
                    ? UUID.fromString(event.get("adminId").toString())
                    : UUID.fromString(event.get("teacherId").toString());
            UUID sessionId = UUID.fromString(event.get("sessionId").toString());
            int approved = event.containsKey("approvedCount") ? ((Number) event.get("approvedCount")).intValue() : 0;
            int rejected = event.containsKey("rejectedCount") ? ((Number) event.get("rejectedCount")).intValue() : 0;
            int orphaned = event.containsKey("orphanedCount") ? ((Number) event.get("orphanedCount")).intValue() : 0;

            orchestrator.onReviewCompleted(eventId, adminId,
                    sessionId, approved, rejected, orphaned);
        } catch (Exception e) {
            log.error("Failed to process question-review event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
