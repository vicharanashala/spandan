package com.spandan.polling.application.service;

import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.QuizStatus;
import org.springframework.stereotype.Component;

@Component
public class StateTransitionGuard {

    private static final java.util.Map<QuizStatus, java.util.Set<QuizStatus>> QUIZ_TRANSITIONS =
            java.util.Map.of(
                    QuizStatus.DRAFT, java.util.Set.of(QuizStatus.SCHEDULED, QuizStatus.CANCELLED),
                    QuizStatus.SCHEDULED, java.util.Set.of(QuizStatus.RUNNING, QuizStatus.CANCELLED),
                    QuizStatus.RUNNING, java.util.Set.of(QuizStatus.PAUSED, QuizStatus.COMPLETED, QuizStatus.CANCELLED),
                    QuizStatus.PAUSED, java.util.Set.of(QuizStatus.RUNNING, QuizStatus.CANCELLED),
                    QuizStatus.COMPLETED, java.util.Set.of(),
                    QuizStatus.CANCELLED, java.util.Set.of()
            );

    private static final java.util.Map<QuestionStatus, java.util.Set<QuestionStatus>> QUESTION_TRANSITIONS =
            java.util.Map.of(
                    QuestionStatus.SCHEDULED, java.util.Set.of(QuestionStatus.PUBLISHED, QuestionStatus.CANCELLED),
                    QuestionStatus.PUBLISHED, java.util.Set.of(QuestionStatus.RUNNING),
                    QuestionStatus.RUNNING, java.util.Set.of(QuestionStatus.TIMER_EXPIRED),
                    QuestionStatus.TIMER_EXPIRED, java.util.Set.of(QuestionStatus.CLOSED),
                    QuestionStatus.CLOSED, java.util.Set.of(),
                    QuestionStatus.CANCELLED, java.util.Set.of()
            );

    public void guardQuizTransition(QuizStatus from, QuizStatus to) {
        java.util.Set<QuizStatus> allowed = QUIZ_TRANSITIONS.get(from);
        if (allowed == null || !allowed.contains(to)) {
            throw new IllegalStateException(
                    "Illegal quiz state transition: " + from + " -> " + to);
        }
    }

    public void guardQuestionTransition(QuestionStatus from, QuestionStatus to) {
        java.util.Set<QuestionStatus> allowed = QUESTION_TRANSITIONS.get(from);
        if (allowed == null || !allowed.contains(to)) {
            throw new IllegalStateException(
                    "Illegal question state transition: " + from + " -> " + to);
        }
    }
}
