package com.spandan.notification.infrastructure.kafka.producers;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.enums.TargetType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Component
public class NotificationEventProducer {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventProducer.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String topic;

    public NotificationEventProducer(
            KafkaTemplate<String, Object> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${kafka.topics.notification-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.topic = topic;
    }

    public void sendNotificationCreated(Notification notification, TargetType targetType, UUID targetId) {
        try {
            ObjectNode event = objectMapper.createObjectNode();
            event.put("eventId", UUID.randomUUID().toString());
            event.put("notificationId", notification.getId().toString());
            event.put("userId", notification.getUserId().toString());
            event.put("targetType", targetType.name());
            event.put("targetId", targetId.toString());
            event.put("title", notification.getTitle());
            event.put("message", notification.getMessage());
            event.put("type", notification.getNotificationType().name());
            event.put("channel", "WEBSOCKET");
            event.put("timestamp", Instant.now().toString());

            kafkaTemplate.send(topic, notification.getUserId().toString(), event);
            log.debug("Published NotificationCreated event for notification {}", notification.getId());
        } catch (Exception e) {
            log.error("Failed to publish NotificationCreated event: {}", e.getMessage(), e);
        }
    }
}
