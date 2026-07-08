package com.spandan.notification.infrastructure.kafka.consumers;

import com.spandan.notification.application.service.NotificationOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class UserEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(UserEventConsumer.class);

    private final NotificationOrchestrator orchestrator;

    public UserEventConsumer(NotificationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${kafka.topics.user-events}",
                   groupId = "${kafka.consumer.group-id}.user",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(Map<String, Object> event) {
        try {
            String eventType = (String) event.getOrDefault("eventType", event.get("type"));
            String eventId = event.getOrDefault("eventId", UUID.randomUUID()).toString();
            UUID userId = UUID.fromString(event.get("userId").toString());

            switch (eventType) {
                case "UserLoggedIn" -> orchestrator.onUserLoggedIn(eventId, userId);
                case "UserLoggedOut" -> orchestrator.onUserLoggedOut(eventId, userId);
                case "UserRegistered" -> orchestrator.onUserRegistered(eventId, userId);
                case "UserProfileUpdated" -> orchestrator.onUserProfileUpdated(eventId, userId);
                case "UserDeactivated" -> orchestrator.onUserDeactivated(eventId, userId);
                default -> log.debug("Ignored event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process user event: {}", e.getMessage(), e);
            throw e;
        }
    }
}
