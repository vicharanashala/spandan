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
public class AnalyticsEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventConsumer.class);
    private final MessageRoutingService routingService;

    public AnalyticsEventConsumer(MessageRoutingService routingService) {
        this.routingService = routingService;
    }

    @KafkaListener(topics = "analytics-events", containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String type = (String) event.get("type");
                String quizId = (String) event.get("quizId");
                switch (type) {
                    case "TeacherAnalyticsReady" ->
                        routingService.broadcastToTeacher(quizId, event);
                    case "StudentAnalyticsReady" ->
                        routingService.broadcastToQuiz(quizId, event);
                    case "LeaderboardGenerated" ->
                        routingService.broadcastLeaderboard(quizId, event);
                    case "AnalyticsCompleted" ->
                        log.debug("Analytics completed for quizId={}", quizId);
                    default ->
                        log.warn("Unknown analytics event type: {}", type);
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing analytics event", e);
            ack.acknowledge();
        }
    }
}
