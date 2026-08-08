package com.spandan.response.infrastructure.kafka.producers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
public class ResponseEventProducer {

    private static final Logger log = LoggerFactory.getLogger(ResponseEventProducer.class);
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String topic;

    public ResponseEventProducer(KafkaTemplate<String, Object> kafkaTemplate,
                                 @Value("${response-events.topic:response-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    public void interactionPersisted(UUID interactionId, UUID sessionId, UUID studentId,
                                     UUID questionId, String eventType, Boolean isCorrect) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("interactionId", interactionId.toString());
        event.put("sessionId", sessionId.toString());
        event.put("studentId", studentId.toString());
        event.put("questionId", questionId.toString());
        event.put("eventType", eventType);
        event.put("isCorrect", isCorrect);
        event.put("eventTimestamp", Instant.now().toString());
        send(interactionId.toString(), "InteractionPersistedEvent", event);
    }

    public void sessionInteractionCompleted(UUID sessionId, UUID lectureId, long totalInteractions) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("sessionId", sessionId.toString());
        event.put("lectureId", lectureId != null ? lectureId.toString() : null);
        event.put("completedAt", Instant.now().toString());
        event.put("totalInteractions", totalInteractions);
        send(sessionId.toString(), "SessionInteractionCompletedEvent", event);
    }

    private void send(String key, String eventType, Map<String, Object> event) {
        event.put("eventType", eventType);
        CompletableFuture<?> future = kafkaTemplate.send(topic, key, event);
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to send {} to topic {}", eventType, topic, ex);
            }
        });
    }
}
