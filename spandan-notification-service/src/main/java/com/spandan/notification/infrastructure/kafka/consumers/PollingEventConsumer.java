package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class PollingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PollingEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public PollingEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @SuppressWarnings("unchecked")
    @KafkaListener(topics = "${kafka.topics.polling-events}",
                   groupId = "${kafka.consumer.group-id}.polling",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID sessionId = UUID.fromString(event.getOrDefault("sessionId", event.get("quizId")).toString());
            UUID quizId = UUID.fromString(event.get("quizId").toString());
            UUID adminId = event.containsKey("adminId") && event.get("adminId") != null
                    ? UUID.fromString(event.get("adminId").toString()) : null;

            switch (eventType) {
                case "QuizStartingEvent" -> {
                    int questionCount = event.containsKey("questionCount") ? ((Number) event.get("questionCount")).intValue() : 0;
                    List<UUID> studentIds = List.of();
                    if (event.get("studentIds") instanceof List rawList) {
                        studentIds = ((List<Object>) rawList).stream()
                                .map(id -> UUID.fromString(id.toString()))
                                .collect(Collectors.toList());
                    }
                    if (adminId == null) {
                        log.warn("QuizStartingEvent missing adminId for quiz {}, skipping admin notification", quizId);
                    }
                    orchestrator.onQuizStarting(eventId, adminId, sessionId, quizId, questionCount, studentIds);
                }
                case "QuizCompleted" -> {
                    if (adminId != null) {
                        orchestrator.onQuizCompleted(eventId, adminId, sessionId, quizId);
                    } else {
                        log.warn("QuizCompleted event missing adminId for quiz {}, skipping notification", quizId);
                    }
                }
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process polling event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
