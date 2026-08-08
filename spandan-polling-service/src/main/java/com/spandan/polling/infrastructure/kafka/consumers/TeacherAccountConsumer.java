package com.spandan.polling.infrastructure.kafka.consumers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TeacherAccountConsumer {

    private static final Logger log = LoggerFactory.getLogger(TeacherAccountConsumer.class);

    @KafkaListener(topics = "${polling.kafka.auth-events-topic:auth-events}",
                   groupId = "${spring.kafka.consumer.group-id:polling-service}")
    public void onTeacherAccountEvent(Map<String, Object> event) {
        String eventType = (String) event.get("eventType");
        String userId = (String) event.get("userId");

        log.info("Received auth event: type={}, userId={}", eventType, userId);
    }
}
