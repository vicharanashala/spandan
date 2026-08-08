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
public class ResponseEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(ResponseEventConsumer.class);

    private final AnalyticsOrchestrator orchestrator;

    public ResponseEventConsumer(AnalyticsOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "${response.events.topic:response-events}",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String type = (String) event.get("eventType");
                if ("SessionInteractionCompletedEvent".equals(type)) {
                    String sessionIdStr = (String) event.get("sessionId");
                    if (sessionIdStr != null) {
                        UUID sessionId = UUID.fromString(sessionIdStr);
                        log.info("Received SessionInteractionCompletedEvent for sessionId={}", sessionId);
                        orchestrator.processSessionCompleted(sessionId);
                    }
                } else if ("InteractionPersistedEvent".equals(type)) {
                    String sessionIdStr = (String) event.get("sessionId");
                    if (sessionIdStr != null) {
                        log.debug("Received InteractionPersistedEvent for sessionId={}", sessionIdStr);
                    }
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing response event", e);
            ack.acknowledge();
        }
    }
}
