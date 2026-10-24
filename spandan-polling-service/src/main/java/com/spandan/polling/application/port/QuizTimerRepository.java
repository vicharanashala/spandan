package com.spandan.polling.application.port;

import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.TimerStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuizTimerRepository {
    Optional<QuizTimer> findByQuizQuestionId(UUID quizQuestionId);
    List<QuizTimer> findByTimerStatus(TimerStatus status);
    List<QuizTimer> findExpiredRunningTimers(long maxDurationSeconds);
    QuizTimer save(QuizTimer timer);
}
