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
public class QuestionGenerationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionGenerationEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public QuestionGenerationEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.question-generation-events}",
                   groupId = "${kafka.consumer.group-id}.qg",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            JsonNode payload = event.getPayload();
            UUID teacherId = UUID.fromString(payload.get("teacherId").asText());
            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());
            String eventId = event.getEventId().toString();

            switch (event.getEventType()) {
                case "QuestionsGenerated" -> {
                    int questionCount = payload.get("questionCount").asInt();
                    orchestrator.onQuestionsGenerated(eventId, teacherId, sessionId, questionCount);
                }
                case "QuestionGenerationFailed" -> {
                    String reason = payload.get("failureReason").asText();
                    orchestrator.onQuestionGenerationFailed(eventId, teacherId, sessionId, reason);
                }
                default -> log.debug("Ignored event type: {}", event.getEventType());
            }
        } catch (Exception e) {
            log.error("Failed to process question-generation event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
