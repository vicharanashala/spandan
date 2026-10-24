package com.spandan.recording.infrastructure.kafka.producers;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.port.StreamLifecyclePublisher;
import com.spandan.recording.infrastructure.kafka.dto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
public class StreamLifecycleProducer implements StreamLifecyclePublisher {

    private static final Logger log = LoggerFactory.getLogger(StreamLifecycleProducer.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String topic;

    public StreamLifecycleProducer(KafkaTemplate<String, Object> kafkaTemplate,
                                   @Value("${kafka.topics.audio-stream-events:audio-stream-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    @Override
    public void publishStarted(StreamSession session) {
        var event = new StreamStartedEvent(
                session.getSessionId().toString(),
                session.getTeacherId().toString(),
                session.getLectureId() != null ? session.getLectureId().toString() : null,
                session.getAudioFormat().name(),
                session.getProvider().name(),
                session.getStatus().name(),
                session.getStartedAt().toString()
        );
        send("StreamStarted", session.getSessionId().toString(), event);
    }

    @Override
    public void publishStopped(StreamSession session) {
        var event = new StreamStoppedEvent(
                session.getSessionId().toString(),
                session.getTeacherId().toString(),
                session.getStatus().name(),
                session.getStartedAt().toString(),
                session.getDurationMs(),
                session.getChunksSent(),
                session.getChunksDropped(),
                session.getStoppedAt() != null ? session.getStoppedAt().toString() : null
        );
        send("StreamStopped", session.getSessionId().toString(), event);
    }

    @Override
    public void publishInterrupted(StreamSession session, String reason) {
        var event = new StreamInterruptedEvent(
                session.getSessionId().toString(),
                session.getTeacherId().toString(),
                session.getStatus().name(),
                session.getStartedAt().toString(),
                reason,
                Instant.now().toString()
        );
        send("StreamInterrupted", session.getSessionId().toString(), event);
    }

    @Override
    public void publishRecovered(StreamSession session) {
        var event = new StreamRecoveredEvent(
                session.getSessionId().toString(),
                session.getTeacherId().toString(),
                session.getStatus().name(),
                session.getStartedAt().toString(),
                Instant.now().toString()
        );
        send("StreamRecovered", session.getSessionId().toString(), event);
    }

    @Override
    public void publishFailed(StreamSession session, String reason) {
        var event = new StreamFailedEvent(
                session.getSessionId().toString(),
                session.getTeacherId().toString(),
                session.getStatus().name(),
                session.getStartedAt().toString(),
                reason,
                Instant.now().toString()
        );
        send("StreamingFailed", session.getSessionId().toString(), event);
    }

    private void send(String eventType, String key, Object event) {
        try {
            CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(topic, key, event);
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Failed to publish {} event: sessionId={}, error={}",
                            eventType, key, ex.getMessage(), ex);
                }
            });
            log.info("Published {} event: sessionId={}", eventType, key);
        } catch (Exception e) {
            log.error("Failed to publish {} event: sessionId={}", eventType, key, e);
        }
    }
}
