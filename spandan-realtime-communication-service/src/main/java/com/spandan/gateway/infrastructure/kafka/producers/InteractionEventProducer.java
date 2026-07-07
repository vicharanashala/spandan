package com.spandan.gateway.infrastructure.kafka.producers;

import com.spandan.gateway.application.port.InteractionEventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
public class InteractionEventProducer implements InteractionEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(InteractionEventProducer.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String topic;

    public InteractionEventProducer(
            KafkaTemplate<String, Object> kafkaTemplate,
            @Value("${interaction-events.topic:interaction-events}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    @Override
    public void questionDisplayed(String eventId, Instant eventTimestamp, String sessionId,
                                   String lectureId, String studentId, String questionId,
                                   String sectionId, String subsectionId, String topicId,
                                   String conceptId, Integer questionSequence,
                                   Instant questionDisplayedAt) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", eventId);
        event.put("eventType", "QuestionDisplayedEvent");
        event.put("eventTimestamp", eventTimestamp.toString());
        event.put("sessionId", sessionId);
        event.put("lectureId", lectureId);
        event.put("studentId", studentId);
        event.put("questionId", questionId);
        event.put("sectionId", sectionId);
        event.put("subsectionId", subsectionId);
        event.put("topicId", topicId);
        event.put("conceptId", conceptId);
        event.put("questionSequence", questionSequence);
        event.put("questionDisplayedAt", questionDisplayedAt.toString());
        send(questionId, event);
    }

    @Override
    public void questionAnswered(String eventId, Instant eventTimestamp, String sessionId,
                                  String lectureId, String studentId, String questionId,
                                  String selectedAnswer, Instant questionDisplayedAt,
                                  Instant questionAnsweredAt, long responseTimeMilliseconds) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", eventId);
        event.put("eventType", "QuestionAnsweredEvent");
        event.put("eventTimestamp", eventTimestamp.toString());
        event.put("sessionId", sessionId);
        event.put("lectureId", lectureId);
        event.put("studentId", studentId);
        event.put("questionId", questionId);
        event.put("selectedAnswer", selectedAnswer);
        event.put("questionDisplayedAt", questionDisplayedAt.toString());
        event.put("questionAnsweredAt", questionAnsweredAt.toString());
        event.put("responseTimeMilliseconds", responseTimeMilliseconds);
        send(questionId, event);
    }

    @Override
    public void questionTimedOut(String eventId, Instant eventTimestamp, String sessionId,
                                  String lectureId, String studentId, String questionId,
                                  Instant questionDisplayedAt, Instant timeoutAt,
                                  long timeoutDurationMilliseconds) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", eventId);
        event.put("eventType", "QuestionTimedOutEvent");
        event.put("eventTimestamp", eventTimestamp.toString());
        event.put("sessionId", sessionId);
        event.put("lectureId", lectureId);
        event.put("studentId", studentId);
        event.put("questionId", questionId);
        event.put("questionDisplayedAt", questionDisplayedAt.toString());
        event.put("timeoutAt", timeoutAt.toString());
        event.put("timeoutDurationMilliseconds", timeoutDurationMilliseconds);
        send(questionId, event);
    }

    private void send(String key, Map<String, Object> event) {
        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(topic, key, event);
        future.whenComplete((result, ex) -> {
            if (ex == null) {
                log.debug("Event sent to topic {} key {} at offset {}",
                        topic, key, result.getRecordMetadata().offset());
            } else {
                log.error("Failed to send event to topic {} with key {}", topic, key, ex);
            }
        });
    }
}
