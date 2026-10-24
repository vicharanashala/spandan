package com.spandan.polling.infrastructure.persistence.entity;

import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.TimerStatus;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "quiz_timers")
public class QuizTimerEntity {

    @Id
    private UUID id;

    @Column(name = "quiz_question_id", nullable = false, unique = true)
    private UUID quizQuestionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "timer_status", nullable = false, length = 20)
    private TimerStatus timerStatus;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Column(name = "remaining_seconds", nullable = false)
    private int remainingSeconds;

    @Column(name = "timer_started_at")
    private Instant timerStartedAt;

    @Column(name = "timer_paused_at")
    private Instant timerPausedAt;

    public QuizTimerEntity() {}

    public QuizTimerEntity(UUID id, UUID quizQuestionId, TimerStatus timerStatus,
                           int durationSeconds, int remainingSeconds,
                           Instant timerStartedAt, Instant timerPausedAt) {
        this.id = id;
        this.quizQuestionId = quizQuestionId;
        this.timerStatus = timerStatus;
        this.durationSeconds = durationSeconds;
        this.remainingSeconds = remainingSeconds;
        this.timerStartedAt = timerStartedAt;
        this.timerPausedAt = timerPausedAt;
    }

    public static QuizTimerEntity fromDomain(QuizTimer timer) {
        return new QuizTimerEntity(
                timer.getId(), timer.getQuizQuestionId(), timer.getTimerStatus(),
                timer.getDurationSeconds(), timer.getRemainingSeconds(),
                timer.getTimerStartedAt(), timer.getTimerPausedAt()
        );
    }

    public QuizTimer toDomain() {
        return new QuizTimer(
                id, quizQuestionId, timerStatus, durationSeconds,
                remainingSeconds, timerStartedAt, timerPausedAt
        );
    }

    public UUID getId() { return id; }
    public UUID getQuizQuestionId() { return quizQuestionId; }
    public TimerStatus getTimerStatus() { return timerStatus; }
    public int getDurationSeconds() { return durationSeconds; }
    public int getRemainingSeconds() { return remainingSeconds; }
    public Instant getTimerStartedAt() { return timerStartedAt; }
    public Instant getTimerPausedAt() { return timerPausedAt; }
}
