package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.entity.ActivePoll;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class TimeoutSweepService {

    private static final Logger log = LoggerFactory.getLogger(TimeoutSweepService.class);

    private final InteractionTimingService timingService;
    private final ConcurrentHashMap<String, ActivePoll> activePolls = new ConcurrentHashMap<>();

    public TimeoutSweepService(InteractionTimingService timingService) {
        this.timingService = timingService;
    }

    public void registerPoll(ActivePoll poll) {
        activePolls.put(poll.getQuestionId(), poll);
        log.debug("Registered active poll: questionId={}", poll.getQuestionId());
    }

    public void unregisterPoll(String questionId) {
        activePolls.remove(questionId);
        log.debug("Unregistered active poll: questionId={}", questionId);
    }

    @Scheduled(fixedDelayString = "${rtc.timeout-sweep-interval-ms:5000}")
    public void sweepTimeouts() {
        for (ActivePoll poll : activePolls.values()) {
            try {
                int count = timingService.checkAndProcessTimeouts(
                    poll.getQuestionId(), poll.getPollDurationMs());
                if (count > 0) {
                    log.debug("Processed {} timeouts for questionId={}", count, poll.getQuestionId());
                }
            } catch (Exception e) {
                log.error("Error sweeping timeouts for questionId={}", poll.getQuestionId(), e);
            }
        }
    }

    public void forceTimeoutsForQuestion(String sessionId, String lectureId, String questionId) {
        timingService.forceTimeoutRemaining(sessionId, lectureId, questionId);
        unregisterPoll(questionId);
    }
}
