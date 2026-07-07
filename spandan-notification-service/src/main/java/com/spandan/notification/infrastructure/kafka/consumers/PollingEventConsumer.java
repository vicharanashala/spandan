package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.dto.event.EventEnvelope;
import com.spandan.notification.application.service.NotificationOrchestrator;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
public class PollingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PollingEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public PollingEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.polling-events}",
                   groupId = "${kafka.consumer.group-id}.polling",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(EventEnvelope event) {
        try {
            JsonNode payload = event.getPayload();
            String eventId = event.getEventId().toString();
            UUID sessionId = UUID.fromString(payload.get("sessionId").asText());
            UUID quizId = UUID.fromString(payload.get("quizId").asText());

            switch (event.getEventType()) {
                case "QuizStartingEvent" -> {
                    int questionCount = payload.get("questionCount").asInt();
                    List<UUID> studentIds = new ArrayList<>();
                    for (JsonNode node : payload.get("studentIds")) {
                        studentIds.add(UUID.fromString(node.asText()));
                    }
                    orchestrator.onQuizStarting(eventId, sessionId, quizId, questionCount, studentIds);
                }
                case "QuizCompleted" ->
                    orchestrator.onQuizCompleted(eventId, sessionId, quizId);
                default -> log.debug("Ignored event type: {}", event.getEventType());
            }
        } catch (Exception e) {
            log.error("Failed to process polling event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
