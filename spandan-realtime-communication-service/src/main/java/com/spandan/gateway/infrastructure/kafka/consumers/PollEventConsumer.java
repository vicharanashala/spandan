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
public class PollEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PollEventConsumer.class);
    private final MessageRoutingService routingService;

    public PollEventConsumer(MessageRoutingService routingService) {
        this.routingService = routingService;
    }

    @KafkaListener(topics = "polling-events", containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String type = (String) event.get("type");
                String quizId = (String) event.get("quizId");
                switch (type) {
                    case "PollStarted" -> routingService.broadcastToQuiz(quizId, event);
                    case "TimerStarted" -> routingService.broadcastToQuiz(quizId, event);
                    case "TimerExpired" -> routingService.broadcastToQuiz(quizId, event);
                    case "PollEnded" -> routingService.broadcastToQuiz(quizId, event);
                    default -> log.warn("Unknown poll event type: {}", type);
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing poll event", e);
            ack.acknowledge();
        }
    }
}
