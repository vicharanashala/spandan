package com.spandan.auth.infrastructure.kafka;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class AuthEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(AuthEventPublisher.class);

    private final KafkaTemplate<String, AuthEvent> kafkaTemplate;
    private final String topic;

    public AuthEventPublisher(KafkaTemplate<String, AuthEvent> kafkaTemplate,
                              @Value("${auth.kafka.topic:auth-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    @CircuitBreaker(name = "kafkaPublisher", fallbackMethod = "publishFallback")
    public void publish(AuthEvent event) {
        kafkaTemplate.send(topic, event.userId().toString(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.warn("Failed to publish auth event {}: {}", event.eventType(), ex.getMessage());
                    }
                });
    }

    @SuppressWarnings("unused")
    private void publishFallback(AuthEvent event, Throwable t) {
        log.error("Circuit breaker open for Kafka. Dropping auth event {}: {}",
                event.eventType(), t.getMessage());
    }
}
