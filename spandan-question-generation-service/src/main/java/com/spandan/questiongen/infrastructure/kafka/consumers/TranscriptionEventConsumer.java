package com.spandan.questiongen.infrastructure.kafka.consumers;

import com.spandan.questiongen.application.service.QuestionGenerationOrchestrator;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
public class TranscriptionEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionEventConsumer.class);

    private final QuestionGenerationOrchestrator orchestrator;

    public TranscriptionEventConsumer(QuestionGenerationOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @KafkaListener(topics = "transcription-events", groupId = "question-generation-service")
    public void onTranscriptionEvent(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            String eventType = record.key();
            var value = record.value();

            log.info("Received transcription event: key={}, offset={}", eventType, record.offset());

            if ("TranscriptGenerated".equals(eventType)) {
                var transcriptId = extractTranscriptId(value);
                var sessionId = extractSessionId(value);
                var teacherId = extractTeacherId(value);
                if (transcriptId != null && sessionId != null && teacherId != null) {
                    orchestrator.requestGeneration(transcriptId, sessionId, teacherId, null, null, null);
                }
            }

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing transcription event at offset {}", record.offset(), e);
            ack.acknowledge();
        }
    }

    private java.util.UUID extractTranscriptId(Object value) {
        try {
            var json = new com.fasterxml.jackson.databind.ObjectMapper().convertValue(value, com.fasterxml.jackson.databind.JsonNode.class);
            var id = json.path("transcriptId").asText();
            return id.isEmpty() ? null : java.util.UUID.fromString(id);
        } catch (Exception e) {
            return null;
        }
    }

    private java.util.UUID extractSessionId(Object value) {
        try {
            var json = new com.fasterxml.jackson.databind.ObjectMapper().convertValue(value, com.fasterxml.jackson.databind.JsonNode.class);
            var id = json.path("sessionId").asText();
            return id.isEmpty() ? null : java.util.UUID.fromString(id);
        } catch (Exception e) {
            return null;
        }
    }

    private java.util.UUID extractTeacherId(Object value) {
        try {
            var json = new com.fasterxml.jackson.databind.ObjectMapper().convertValue(value, com.fasterxml.jackson.databind.JsonNode.class);
            var id = json.path("teacherId").asText();
            return id.isEmpty() ? null : java.util.UUID.fromString(id);
        } catch (Exception e) {
            return null;
        }
    }
}
