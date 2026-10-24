package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class QuestionGenerationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionGenerationEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public QuestionGenerationEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.question-generation-events}",
                   groupId = "${kafka.consumer.group-id}.qg",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID sessionId = UUID.fromString(event.get("sessionId").toString());

            switch (eventType) {
                case "QuestionsGenerated" -> {
                    UUID adminId = event.containsKey("adminId") && event.get("adminId") != null
                            ? UUID.fromString(event.get("adminId").toString())
                            : UUID.fromString(event.get("teacherId").toString());
                    int questionCount = event.containsKey("questionCount") ? ((Number) event.get("questionCount")).intValue() : 0;
                    orchestrator.onQuestionsGenerated(eventId, adminId, sessionId, questionCount);
                }
                case "QuestionGenerationFailed" -> {
                    UUID teacherId = UUID.fromString(event.get("teacherId").toString());
                    String reason = (String) event.get("failureReason");
                    orchestrator.onQuestionGenerationFailed(eventId, teacherId, sessionId, reason);
                }
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process question-generation event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
