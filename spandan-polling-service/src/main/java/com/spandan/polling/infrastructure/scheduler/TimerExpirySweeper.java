package com.spandan.polling.infrastructure.scheduler;

import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.application.service.QuizSequencer;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.entity.QuizTimer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
public class TimerExpirySweeper {

    private static final Logger log = LoggerFactory.getLogger(TimerExpirySweeper.class);

    private final QuizTimerRepository timerRepository;
    private final QuizQuestionRepository questionRepository;
    private final QuizSequencer quizSequencer;

    public TimerExpirySweeper(QuizTimerRepository timerRepository,
                              QuizQuestionRepository questionRepository,
                              QuizSequencer quizSequencer) {
        this.timerRepository = timerRepository;
        this.questionRepository = questionRepository;
        this.quizSequencer = quizSequencer;
    }

    @Scheduled(fixedRateString = "${polling.sweep.interval-ms:1000}")
    @Transactional
    public void sweepExpiredTimers() {
        List<QuizTimer> expiredTimers = timerRepository.findExpiredRunningTimers(600);

        for (QuizTimer timer : expiredTimers) {
            QuizQuestion question = questionRepository.findById(timer.getQuizQuestionId())
                    .orElse(null);

            if (question == null || !question.isRunning()) {
                continue;
            }

            try {
                quizSequencer.expireQuestion(
                        question.getQuizId(),
                        question.getId(),
                        question.getSequencePosition()
                );

                quizSequencer.advanceToNextQuestion(
                        question.getQuizId(),
                        question.getId()
                );

                log.info("Sweeper: expired and advanced question {} in quiz {}",
                        question.getId(), question.getQuizId());
            } catch (Exception e) {
                log.error("Sweeper: failed to process expired timer for question {}: {}",
                        timer.getQuizQuestionId(), e.getMessage());
            }
        }
    }
}
