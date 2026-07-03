package com.spandan.analytics.infrastructure.kafka.consumers;

import com.spandan.analytics.application.service.AnalyticsOrchestrator;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
public class QuizCompletedConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuizCompletedConsumer.class);
    private final AnalyticsOrchestrator orchestrator;

    public QuizCompletedConsumer(AnalyticsOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "polling-events", containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String type = (String) event.get("type");
                if ("QuizCompleted".equals(type)) {
                    UUID quizId = UUID.fromString((String) event.get("quizId"));
                    log.info("Received QuizCompleted event for quizId={}", quizId);
                    orchestrator.processQuizCompleted(quizId);
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing QuizCompleted event", e);
            ack.acknowledge();
        }
    }
}
