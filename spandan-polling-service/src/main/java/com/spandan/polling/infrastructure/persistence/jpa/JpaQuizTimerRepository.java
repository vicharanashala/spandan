package com.spandan.polling.infrastructure.persistence.jpa;

import com.spandan.polling.domain.enums.TimerStatus;
import com.spandan.polling.infrastructure.persistence.entity.QuizTimerEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JpaQuizTimerRepository extends JpaRepository<QuizTimerEntity, UUID> {

    Optional<QuizTimerEntity> findByQuizQuestionId(UUID quizQuestionId);

    List<QuizTimerEntity> findByTimerStatus(TimerStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(value = "SELECT * FROM quiz_timers WHERE timer_status = 'RUNNING' AND timer_started_at IS NOT NULL AND (timer_started_at + (duration_seconds || ' seconds')::INTERVAL) <= NOW()", nativeQuery = true)
    List<QuizTimerEntity> findExpiredRunningTimers();
}
