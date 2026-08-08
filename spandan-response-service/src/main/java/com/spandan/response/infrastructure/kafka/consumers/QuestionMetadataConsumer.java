package com.spandan.response.infrastructure.kafka.consumers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.response.application.service.QuestionMetadataService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class QuestionMetadataConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionMetadataConsumer.class);
    private final QuestionMetadataService questionMetadataService;
    private final ObjectMapper objectMapper;

    public QuestionMetadataConsumer(QuestionMetadataService questionMetadataService, ObjectMapper objectMapper) {
        this.questionMetadataService = questionMetadataService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${question-generation.events.topic:question-generation-events}",
                   containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            if (!(record.value() instanceof Map event)) {
                ack.acknowledge();
                return;
            }

            String eventType = record.key();
            if ("QuestionGeneratedEvent".equals(eventType)) {
                questionMetadataService.processQuestionGeneratedEvent(event);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing question metadata event", e);
            ack.acknowledge();
        }
    }
}
