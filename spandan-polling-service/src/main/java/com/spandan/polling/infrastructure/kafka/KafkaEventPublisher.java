package com.spandan.polling.infrastructure.kafka;

import com.spandan.polling.application.port.EventPublisher;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class KafkaEventPublisher implements EventPublisher {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventPublisher.class);

    private final KafkaTemplate<String, PollingEvent> kafkaTemplate;
    private final String topic;

    public KafkaEventPublisher(KafkaTemplate<String, PollingEvent> kafkaTemplate,
                               @Value("${polling.kafka.topic:polling-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    @CircuitBreaker(name = "kafkaPublisher", fallbackMethod = "publishFallback")
    @Override
    public void publish(PollingEvent event) {
        kafkaTemplate.send(topic, event.quizId().toString(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.warn("Failed to publish event {}: {}", event.eventType(), ex.getMessage());
                    }
                });
    }

    @SuppressWarnings("unused")
    private void publishFallback(PollingEvent event, Throwable t) {
        log.error("Circuit breaker open for Kafka. Dropping event {}: {}",
                event.eventType(), t.getMessage());
    }
}
