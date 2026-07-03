package com.spandan.polling.infrastructure.kafka.consumers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class QuestionApprovalEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(QuestionApprovalEventConsumer.class);

    @KafkaListener(topics = "${polling.kafka.question-review-topic:question-review-events}",
                   groupId = "${spring.kafka.consumer.group-id:polling-service}")
    public void onQuestionApproved(Map<String, Object> event) {
        String eventType = (String) event.get("eventType");
        String questionRefId = (String) event.get("questionRefId");
        String status = (String) event.get("status");

        log.info("Received question review event: type={}, questionRefId={}, status={}",
                eventType, questionRefId, status);
    }
}
