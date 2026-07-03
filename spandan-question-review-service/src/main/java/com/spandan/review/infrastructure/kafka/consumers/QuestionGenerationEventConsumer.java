package com.spandan.review.infrastructure.kafka.consumers;

import com.spandan.review.application.service.ReviewEventHandler;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
public class QuestionGenerationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionGenerationEventConsumer.class);

    private final ReviewEventHandler reviewEventHandler;

    public QuestionGenerationEventConsumer(ReviewEventHandler reviewEventHandler) {
        this.reviewEventHandler = reviewEventHandler;
    }

    @KafkaListener(topics = "question-generation-events", groupId = "question-review-service")
    public void onQuestionGenerationEvent(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            String eventType = record.key();
            var value = record.value();

            log.info("Received event: key={}, offset={}", eventType, record.offset());

            switch (eventType) {
                case "QuestionsReadyForReview" -> reviewEventHandler.handleQuestionsReadyForReview(value);
                case "TemporaryQuestionsExpired" -> reviewEventHandler.handleTemporaryQuestionsExpired(value);
                default -> log.debug("Ignoring unknown event type: {}", eventType);
            }

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing event at offset {}", record.offset(), e);
            ack.acknowledge();
        }
    }
}
