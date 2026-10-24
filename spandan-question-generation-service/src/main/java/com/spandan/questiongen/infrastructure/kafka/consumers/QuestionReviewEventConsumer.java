package com.spandan.questiongen.infrastructure.kafka.consumers;

import com.spandan.questiongen.application.service.ReviewStatusSyncService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
public class QuestionReviewEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionReviewEventConsumer.class);

    private final ReviewStatusSyncService reviewStatusSyncService;

    public QuestionReviewEventConsumer(ReviewStatusSyncService reviewStatusSyncService) {
        this.reviewStatusSyncService = reviewStatusSyncService;
    }

    @KafkaListener(topics = "question-review-events", groupId = "question-generation-service")
    public void onQuestionReviewEvent(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            String eventType = record.key();
            var value = record.value();

            log.info("Received question review event: key={}, offset={}", eventType, record.offset());

            reviewStatusSyncService.handleReviewEvent(eventType, value);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing question review event at offset {}", record.offset(), e);
            ack.acknowledge();
        }
    }
}
