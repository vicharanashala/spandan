package com.spandan.polling.application.service;

import com.spandan.polling.application.port.EventPublisher;
import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.application.port.QuizRepository;
import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.TimerStatus;
import com.spandan.polling.infrastructure.kafka.PollingEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Component
public class QuizSequencer {

    private static final Logger log = LoggerFactory.getLogger(QuizSequencer.class);

    private final QuizRepository quizRepository;
    private final QuizQuestionRepository questionRepository;
    private final QuizTimerRepository timerRepository;
    private final EventPublisher eventPublisher;
    private final StateTransitionGuard transitionGuard;

    public QuizSequencer(QuizRepository quizRepository,
                         QuizQuestionRepository questionRepository,
                         QuizTimerRepository timerRepository,
                         EventPublisher eventPublisher,
                         StateTransitionGuard transitionGuard) {
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.timerRepository = timerRepository;
        this.eventPublisher = eventPublisher;
        this.transitionGuard = transitionGuard;
    }

    @Transactional
    public void advanceToNextQuestion(UUID quizId, UUID currentQuestionId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new com.spandan.polling.domain.exception.QuizNotFoundException(quizId));

        QuizQuestion currentQuestion = questionRepository.findByIdWithLock(currentQuestionId)
                .orElseThrow(() -> new com.spandan.polling.domain.exception.QuestionNotFoundException(currentQuestionId));

        transitionGuard.guardQuestionTransition(currentQuestion.getQuestionStatus(), QuestionStatus.CLOSED);
        currentQuestion.close();
        questionRepository.save(currentQuestion);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "PollEnded", quizId, currentQuestion.getId(),
                currentQuestion.getQuestionRefId(), currentQuestion.getSequencePosition(),
                Instant.now(), null, null
        ));

        if (quiz.isLastQuestion()) {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), com.spandan.polling.domain.enums.QuizStatus.COMPLETED);
            quiz.complete();
            quizRepository.save(quiz);

            eventPublisher.publish(new PollingEvent(
                    UUID.randomUUID(), "QuizCompleted", quizId, null, null, null,
                    Instant.now(), null, quiz.getTotalQuestions()
            ));
            return;
        }

        quiz.advanceToNextQuestion();
        quizRepository.save(quiz);

        int nextPosition = quiz.getCurrentQuestionNumber();
        QuizQuestion nextQuestion = questionRepository.findByQuizIdAndSequencePosition(quizId, nextPosition)
                .orElseThrow(() -> new IllegalStateException("No question at position " + nextPosition));

        publishQuestion(quizId, nextQuestion);
    }

    @Transactional
    public void publishQuestion(UUID quizId, QuizQuestion question) {
        transitionGuard.guardQuestionTransition(question.getQuestionStatus(), QuestionStatus.PUBLISHED);
        question.publish();
        questionRepository.save(question);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "PollStarted", quizId, question.getId(),
                question.getQuestionRefId(), question.getSequencePosition(),
                Instant.now(), question.getTimerDurationSeconds(), null
        ));

        QuizTimer timer = QuizTimer.create(question.getId(), question.getTimerDurationSeconds());
        timer.start();
        timerRepository.save(timer);

        transitionGuard.guardQuestionTransition(question.getQuestionStatus(), QuestionStatus.RUNNING);
        question.startTimer();
        questionRepository.save(question);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "TimerStarted", quizId, question.getId(),
                question.getQuestionRefId(), question.getSequencePosition(),
                Instant.now(), question.getTimerDurationSeconds(), null
        ));

        log.info("Published question {} at position {} for quiz {}",
                question.getId(), question.getSequencePosition(), quizId);
    }

    @Transactional
    public void expireQuestion(UUID quizId, UUID questionId, int sequencePosition) {
        QuizQuestion question = questionRepository.findByIdWithLock(questionId)
                .orElseThrow(() -> new com.spandan.polling.domain.exception.QuestionNotFoundException(questionId));

        QuizTimer timer = timerRepository.findByQuizQuestionId(questionId)
                .orElseThrow(() -> new IllegalStateException("No timer for question " + questionId));

        timer.expire();
        timerRepository.save(timer);

        transitionGuard.guardQuestionTransition(question.getQuestionStatus(), QuestionStatus.TIMER_EXPIRED);
        question.expireTimer();
        questionRepository.save(question);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "TimerExpired", quizId, question.getId(),
                question.getQuestionRefId(), sequencePosition,
                Instant.now(), null, null
        ));

        log.info("Timer expired for question {} at position {} in quiz {}",
                questionId, sequencePosition, quizId);
    }
}
