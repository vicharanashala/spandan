package com.spandan.polling.application.service;

import com.spandan.polling.application.port.EventPublisher;
import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.TimerStatus;
import com.spandan.polling.infrastructure.kafka.PollingEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class TimerService {

    private static final Logger log = LoggerFactory.getLogger(TimerService.class);

    private final QuizTimerRepository timerRepository;
    private final QuizSequencer quizSequencer;
    private final EventPublisher eventPublisher;

    public TimerService(QuizTimerRepository timerRepository,
                        QuizSequencer quizSequencer,
                        EventPublisher eventPublisher) {
        this.timerRepository = timerRepository;
        this.quizSequencer = quizSequencer;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public void pauseTimer(UUID quizId, UUID quizQuestionId) {
        QuizTimer timer = timerRepository.findByQuizQuestionId(quizQuestionId)
                .orElseThrow(() -> new IllegalStateException("No timer for question " + quizQuestionId));

        if (timer.getTimerStatus() != TimerStatus.RUNNING) {
            throw new IllegalStateException("Timer is not running, cannot pause");
        }

        timer.pause();
        timerRepository.save(timer);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "QuizPaused", quizId, quizQuestionId,
                null, null, Instant.now(),
                timer.getRemainingSeconds(), null
        ));
    }

    @Transactional
    public void resumeTimer(UUID quizId, UUID quizQuestionId) {
        QuizTimer timer = timerRepository.findByQuizQuestionId(quizQuestionId)
                .orElseThrow(() -> new IllegalStateException("No timer for question " + quizQuestionId));

        if (timer.getTimerStatus() != TimerStatus.PAUSED) {
            throw new IllegalStateException("Timer is not paused, cannot resume");
        }

        timer.resume();
        timerRepository.save(timer);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "QuizResumed", quizId, quizQuestionId,
                null, null, Instant.now(), null, null
        ));
    }

    @Transactional
    public void expireAndAdvance(UUID quizId, UUID questionId, int sequencePosition) {
        quizSequencer.expireQuestion(quizId, questionId, sequencePosition);
        quizSequencer.advanceToNextQuestion(quizId, questionId);
    }

    public int getRemainingSeconds(UUID quizQuestionId) {
        return timerRepository.findByQuizQuestionId(quizQuestionId)
                .map(QuizTimer::getRemainingSeconds)
                .orElse(0);
    }
}
