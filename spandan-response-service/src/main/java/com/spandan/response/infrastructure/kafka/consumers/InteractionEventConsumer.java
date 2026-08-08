package com.spandan.response.infrastructure.kafka.consumers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.response.application.service.InteractionService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class InteractionEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(InteractionEventConsumer.class);
    private final InteractionService interactionService;
    private final ObjectMapper objectMapper;

    public InteractionEventConsumer(InteractionService interactionService, ObjectMapper objectMapper) {
        this.interactionService = interactionService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${interaction-events.topic:interaction-events}",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            if (!(record.value() instanceof Map event)) {
                log.warn("Non-Map value received, skipping");
                ack.acknowledge();
                return;
            }

            String eventType = str(event, "eventType");
            if (eventType == null) {
                log.warn("Event missing eventType, skipping");
                ack.acknowledge();
                return;
            }

            switch (eventType) {
                case "QuestionDisplayedEvent" -> interactionService.handleDisplayed(event);
                case "QuestionAnsweredEvent" -> interactionService.handleAnswered(event);
                case "QuestionTimedOutEvent" -> interactionService.handleTimedOut(event);
                default -> log.debug("Ignoring unknown event type: {}", eventType);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing interaction event at offset {}", record.offset(), e);
            ack.acknowledge();
        }
    }

    private String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }
}
