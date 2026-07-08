package com.spandan.gateway.infrastructure.kafka.consumers;

import com.spandan.gateway.application.service.MessageRoutingService;
import com.spandan.gateway.application.service.TimeoutSweepService;
import com.spandan.gateway.application.port.ActivePollRepository;
import com.spandan.gateway.domain.entity.ActivePoll;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;

@Component
public class PollEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(PollEventConsumer.class);
    private final MessageRoutingService routingService;
    private final ActivePollRepository activePollRepository;
    private final TimeoutSweepService timeoutSweepService;

    public PollEventConsumer(MessageRoutingService routingService,
                             ActivePollRepository activePollRepository,
                             TimeoutSweepService timeoutSweepService) {
        this.routingService = routingService;
        this.activePollRepository = activePollRepository;
        this.timeoutSweepService = timeoutSweepService;
    }

    @KafkaListener(topics = "polling-events", containerFactory = "kafkaListenerContainerFactory")
    public void consume(ConsumerRecord<String, Object> record, Acknowledgment ack) {
        try {
            Object value = record.value();
            if (value instanceof Map event) {
                String eventType = (String) event.get("eventType");
                if (eventType == null) {
                    eventType = (String) event.get("type");
                }
                String quizId = (String) event.get("quizId");

                switch (eventType) {
                    case "PollOpenedEvent" -> handlePollOpened(event, quizId);
                    case "PollClosedEvent" -> handlePollClosed(event, quizId);
                    case "TimerStarted" -> {
                        routingService.broadcastToQuiz(quizId, event);
                        routingService.broadcastToAdmin(quizId, event);
                    }
                    case "TimerExpired" -> {
                        routingService.broadcastToQuiz(quizId, event);
                        routingService.broadcastToAdmin(quizId, event);
                    }
                    case "QuizStartingEvent" -> {
                        routingService.broadcastToQuiz(quizId, event);
                        routingService.broadcastToAdmin(quizId, event);
                    }
                    case "QuizCompleted" -> {
                        routingService.broadcastToQuiz(quizId, event);
                        routingService.broadcastToAdmin(quizId, event);
                    }
                    case "QuizCancelled" -> {
                        removeActivePoll(event, quizId);
                        routingService.broadcastToQuiz(quizId, event);
                        routingService.broadcastToAdmin(quizId, event);
                    }
                    default -> log.warn("Unknown poll event type: {}", eventType);
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing poll event", e);
            ack.acknowledge();
        }
    }

    @SuppressWarnings("unchecked")
    private void handlePollOpened(Map<String, Object> event, String quizId) {
        String sessionId = stringFrom(event, "sessionId");
        String questionId = stringFrom(event, "questionId");
        if (sessionId == null) {
            sessionId = quizId;
        }
        if (questionId == null) {
            log.warn("PollOpenedEvent missing questionId");
            return;
        }

        Integer timerDurationSeconds = intFrom(event, "timerDurationSeconds");
        long pollDurationMs = timerDurationSeconds != null ? timerDurationSeconds * 1000L : 60000L;
        String lectureId = stringFrom(event, "lectureId");
        String adminId = stringFrom(event, "adminId");

        var poll = new ActivePoll();
        poll.setSessionId(sessionId);
        poll.setQuestionId(questionId);
        poll.setLectureId(lectureId);
        poll.setSectionId(stringFrom(event, "sectionId"));
        poll.setSubsectionId(stringFrom(event, "subsectionId"));
        poll.setTopicId(stringFrom(event, "topicId"));
        poll.setConceptId(stringFrom(event, "conceptId"));
        poll.setQuestionSequence(intFrom(event, "sequencePosition"));
        poll.setPollDurationMs(pollDurationMs);
        poll.setAdminId(adminId);
        poll.setPollOpenedAt(Instant.now());
        poll.setCreatedAt(Instant.now());

        activePollRepository.save(poll);
        timeoutSweepService.registerPoll(poll);

        routingService.broadcastToQuestion(questionId, event);
        routingService.broadcastToQuiz(quizId, event);
        routingService.broadcastToAdmin(quizId, event);

        log.info("Poll opened: sessionId={}, questionId={}, durationMs={}, adminId={}", sessionId, questionId, pollDurationMs, adminId);
    }

    private void handlePollClosed(Map<String, Object> event, String quizId) {
        String sessionId = stringFrom(event, "sessionId");
        String questionId = stringFrom(event, "questionId");
        if (questionId == null) {
            log.warn("PollClosedEvent missing questionId");
            return;
        }

        if (sessionId != null) {
            activePollRepository.deleteBySessionId(sessionId);
            timeoutSweepService.forceTimeoutsForQuestion(sessionId, stringFrom(event, "lectureId"), questionId);
        }

        routingService.broadcastToQuestion(questionId, event);
        routingService.broadcastToQuiz(quizId, event);
        routingService.broadcastToAdmin(quizId, event);

        log.info("Poll closed: sessionId={}, questionId={}", sessionId, questionId);
    }

    private void removeActivePoll(Map<String, Object> event, String quizId) {
        String sessionId = stringFrom(event, "sessionId");
        if (sessionId != null) {
            activePollRepository.deleteBySessionId(sessionId);
        } else {
            activePollRepository.deleteBySessionId(quizId);
        }
    }

    private String stringFrom(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }

    private long longFrom(Map<String, Object> map, String key, long defaultValue) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.longValue();
        if (v != null) {
            try { return Long.parseLong(v.toString()); } catch (NumberFormatException e) { /* fall through */ }
        }
        return defaultValue;
    }

    private Integer intFrom(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        if (v != null) {
            try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { /* fall through */ }
        }
        return null;
    }
}
