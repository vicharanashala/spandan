package com.spandan.transcription.infrastructure.kafka.producers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
public class TranscriptionEventProducer {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionEventProducer.class);
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public TranscriptionEventProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publishTranscriptGenerated(UUID transcriptId, UUID sessionId,
                                            int totalSegments, long totalDurationMs) {
        Map<String, Object> payload = Map.of(
                "transcriptId", transcriptId.toString(),
                "sessionId", sessionId.toString(),
                "totalSegments", totalSegments,
                "totalDurationMs", totalDurationMs,
                "generatedAt", Instant.now().toString()
        );
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "eventType", "TranscriptGenerated",
                "payload", payload,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("transcription-events", sessionId.toString(), event);
    }

    public void publishTranscriptGenerationFailed(UUID sessionId, String failureReason) {
        Map<String, Object> payload = Map.of(
                "sessionId", sessionId.toString(),
                "failureReason", failureReason,
                "failedAt", Instant.now().toString()
        );
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "eventType", "TranscriptGenerationFailed",
                "payload", payload,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("transcription-events", sessionId.toString(), event);
    }

    public void publishTranscriptDeleted(UUID transcriptId, UUID sessionId, String reason) {
        Map<String, Object> payload = Map.of(
                "transcriptId", transcriptId.toString(),
                "sessionId", sessionId.toString(),
                "deletedAt", Instant.now().toString(),
                "reason", reason
        );
        Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "eventType", "TranscriptDeleted",
                "payload", payload,
                "timestamp", Instant.now().toString()
        );
        kafkaTemplate.send("transcription-events", sessionId.toString(), event);
    }
}
