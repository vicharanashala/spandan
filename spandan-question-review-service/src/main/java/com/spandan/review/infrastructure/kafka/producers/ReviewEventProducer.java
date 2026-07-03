package com.spandan.review.infrastructure.kafka.producers;

import com.spandan.review.domain.entity.Review;
import com.spandan.review.domain.port.ReviewEventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
public class ReviewEventProducer implements ReviewEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(ReviewEventProducer.class);
    private static final String TOPIC = "question-review-events";

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public ReviewEventProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @Override
    public void questionApproved(Review review) {
        var event = new QuestionApprovedEvent(
            review.getId(), review.getQuestionId(), review.getQuestionSetId(),
            review.getSessionId(), currentQuestionText(review), review.getQuestionType(),
            review.getReviewedAt()
        );
        send("QuestionApproved", event);
    }

    @Override
    public void questionRejected(Review review, String comments) {
        var event = new QuestionRejectedEvent(
            review.getId(), review.getQuestionId(), review.getQuestionSetId(),
            review.getReviewedAt(), comments
        );
        send("QuestionRejected", event);
    }

    @Override
    public void questionEdited(Review review, int newVersionNumber) {
        var event = new QuestionEditedEvent(
            review.getId(), review.getQuestionId(), review.getQuestionSetId(),
            review.getEditedQuestion(), review.getEditedOptions(),
            review.getEditedCorrectAnswer(), newVersionNumber, review.getUpdatedAt()
        );
        send("QuestionEdited", event);
    }

    @Override
    public void questionOrderChanged(UUID questionSetId, List<UUID> orderedIds) {
        var event = new QuestionOrderChangedEvent(questionSetId, orderedIds, java.time.Instant.now());
        send("QuestionOrderChanged", event);
    }

    @Override
    public void questionSaved(UUID questionSetId) {
        var event = new QuestionSavedEvent(questionSetId, java.time.Instant.now());
        send("QuestionSaved", event);
    }

    @Override
    public void reviewCompleted(UUID questionSetId, UUID sessionId,
                                int approvedCount, int rejectedCount, int orphanedCount) {
        var event = new ReviewCompletedEvent(
            questionSetId, sessionId, approvedCount, rejectedCount, orphanedCount, java.time.Instant.now()
        );
        send("ReviewCompleted", event);
    }

    @Override
    public void readyForPolling(UUID questionSetId, UUID sessionId, List<UUID> approvedQuestionIds) {
        var event = new ReadyForPollingEvent(
            questionSetId, sessionId, approvedQuestionIds, java.time.Instant.now()
        );
        send("ReadyForPolling", event);
    }

    private void send(String key, Object event) {
        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(TOPIC, key, event);
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to send {} event to {}", key, TOPIC, ex);
            } else {
                log.debug("Sent {} event to {} at offset {}", key, TOPIC, result.getRecordMetadata().offset());
            }
        });
    }

    private String currentQuestionText(Review review) {
        return review.getEditedQuestion() != null ? review.getEditedQuestion() : review.getOriginalAiQuestion();
    }

    public record QuestionApprovedEvent(UUID reviewId, UUID questionId, UUID questionSetId,
                                         UUID sessionId, String approvedQuestionText,
                                         String questionType, java.time.Instant approvedAt) {}
    public record QuestionRejectedEvent(UUID reviewId, UUID questionId, UUID questionSetId,
                                         java.time.Instant rejectedAt, String comments) {}
    public record QuestionEditedEvent(UUID reviewId, UUID questionId, UUID questionSetId,
                                       String questionText, String options, String correctAnswer,
                                       int newVersionNumber, java.time.Instant editedAt) {}
    public record QuestionOrderChangedEvent(UUID questionSetId, List<UUID> orderedQuestionIds,
                                             java.time.Instant changedAt) {}
    public record QuestionSavedEvent(UUID questionSetId, java.time.Instant savedAt) {}
    public record ReviewCompletedEvent(UUID questionSetId, UUID sessionId,
                                        int approvedCount, int rejectedCount, int orphanedCount,
                                        java.time.Instant completedAt) {}
    public record ReadyForPollingEvent(UUID questionSetId, UUID sessionId,
                                        List<UUID> approvedQuestionIds, java.time.Instant readyAt) {}
}
