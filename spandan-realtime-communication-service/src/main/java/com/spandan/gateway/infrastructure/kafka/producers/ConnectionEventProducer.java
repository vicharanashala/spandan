package com.spandan.gateway.infrastructure.kafka.producers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
public class ConnectionEventProducer {

    private static final Logger log = LoggerFactory.getLogger(ConnectionEventProducer.class);
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public ConnectionEventProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void studentConnected(String userId, String quizId, String sessionId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "StudentConnected",
                "userId", userId,
                "quizId", quizId,
                "sessionId", sessionId,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }

    public void studentDisconnected(String userId, String quizId, String sessionId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "StudentDisconnected",
                "userId", userId,
                "quizId", quizId,
                "sessionId", sessionId,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }

    public void teacherConnected(String userId, String quizId, String sessionId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "TeacherConnected",
                "userId", userId,
                "quizId", quizId,
                "sessionId", sessionId,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }

    public void teacherDisconnected(String userId, String quizId, String sessionId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "TeacherDisconnected",
                "userId", userId,
                "quizId", quizId,
                "sessionId", sessionId,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }

    public void deliveryFailed(String userId, String quizId, String destination) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "SocketDeliveryFailed",
                "userId", userId,
                "quizId", quizId,
                "destination", destination,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }

    public void studentResponseReceived(String userId, String quizId, String questionId) {
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "type", "StudentResponseReceived",
                "userId", userId,
                "quizId", quizId,
                "questionId", questionId,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("connection-events", quizId, event);
    }
}
