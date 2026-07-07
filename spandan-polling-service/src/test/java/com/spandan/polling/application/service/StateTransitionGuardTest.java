package com.spandan.polling.application.service;

import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.QuizStatus;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class StateTransitionGuardTest {

    private final StateTransitionGuard guard = new StateTransitionGuard();

    @Test
    void quizValidTransitions() {
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.DRAFT, QuizStatus.SCHEDULED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.DRAFT, QuizStatus.CANCELLED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.SCHEDULED, QuizStatus.RUNNING));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.SCHEDULED, QuizStatus.CANCELLED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.RUNNING, QuizStatus.PAUSED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.RUNNING, QuizStatus.COMPLETED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.RUNNING, QuizStatus.CANCELLED));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.PAUSED, QuizStatus.RUNNING));
        assertDoesNotThrow(() -> guard.guardQuizTransition(QuizStatus.PAUSED, QuizStatus.CANCELLED));
    }

    @Test
    void quizInvalidTransitions() {
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuizTransition(QuizStatus.DRAFT, QuizStatus.RUNNING));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuizTransition(QuizStatus.COMPLETED, QuizStatus.RUNNING));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuizTransition(QuizStatus.CANCELLED, QuizStatus.DRAFT));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuizTransition(QuizStatus.SCHEDULED, QuizStatus.COMPLETED));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuizTransition(QuizStatus.RUNNING, QuizStatus.SCHEDULED));
    }

    @Test
    void questionValidTransitions() {
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.SCHEDULED, QuestionStatus.POLL_OPEN));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.SCHEDULED, QuestionStatus.CANCELLED));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.POLL_OPEN, QuestionStatus.RUNNING));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.POLL_OPEN, QuestionStatus.TIMER_EXPIRED));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.POLL_OPEN, QuestionStatus.POLL_CLOSED));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.RUNNING, QuestionStatus.TIMER_EXPIRED));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.TIMER_EXPIRED, QuestionStatus.POLL_CLOSED));
        assertDoesNotThrow(() -> guard.guardQuestionTransition(QuestionStatus.PUBLISHED, QuestionStatus.POLL_CLOSED));
    }

    @Test
    void questionInvalidTransitions() {
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.POLL_CLOSED, QuestionStatus.RUNNING));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.CANCELLED, QuestionStatus.SCHEDULED));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.SCHEDULED, QuestionStatus.POLL_CLOSED));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.RUNNING, QuestionStatus.POLL_CLOSED));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.TIMER_EXPIRED, QuestionStatus.RUNNING));
        assertThrows(IllegalStateException.class,
                () -> guard.guardQuestionTransition(QuestionStatus.CLOSED, QuestionStatus.RUNNING));
    }
}
