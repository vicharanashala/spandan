package com.spandan.gateway.infrastructure.kafka.consumers;

import com.spandan.gateway.application.service.MessageRoutingService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class NotificationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventConsumer.class);
    private final MessageRoutingService routingService;

    public NotificationEventConsumer(MessageRoutingService routingService) {
        this.routingService = routingService;
    }

    @KafkaListener(topics = "notification-events", containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String type = (String) event.get("type");
                if ("NotificationCreated".equals(type)) {
                    String userId = (String) event.get("userId");
                    String targetType = (String) event.get("targetType");
                    String targetId = (String) event.get("targetId");
                    if ("USER".equals(targetType)) {
                        routingService.sendToPersonalNotification(userId, event);
                    } else if ("QUIZ".equals(targetType)) {
                        routingService.broadcastToNotifications(targetId, event);
                    }
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing notification event", e);
            ack.acknowledge();
        }
    }
}
