package com.spandan.polling.domain.entity;

import com.spandan.polling.domain.enums.TimerStatus;

import java.time.Instant;
import java.util.UUID;

public class QuizTimer {

    private final UUID id;
    private final UUID quizQuestionId;
    private TimerStatus timerStatus;
    private final int durationSeconds;
    private int remainingSeconds;
    private Instant timerStartedAt;
    private Instant timerPausedAt;

    public QuizTimer(UUID id, UUID quizQuestionId, TimerStatus timerStatus,
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

    public static QuizTimer create(UUID quizQuestionId, int durationSeconds) {
        return new QuizTimer(
                UUID.randomUUID(), quizQuestionId, TimerStatus.NOT_STARTED,
                durationSeconds, durationSeconds, null, null
        );
    }

    public void start() {
        Instant now = Instant.now();
        this.timerStatus = TimerStatus.RUNNING;
        this.timerStartedAt = now;
        this.remainingSeconds = this.durationSeconds;
    }

    public void pause() {
        if (this.timerStatus != TimerStatus.RUNNING) {
            throw new IllegalStateException("Can only pause a RUNNING timer");
        }
        this.timerStatus = TimerStatus.PAUSED;
        this.timerPausedAt = Instant.now();
        this.remainingSeconds = computeElapsedFromStart();
    }

    public void resume() {
        if (this.timerStatus != TimerStatus.PAUSED) {
            throw new IllegalStateException("Can only resume a PAUSED timer");
        }
        this.timerStatus = TimerStatus.RUNNING;
        this.timerStartedAt = Instant.now();
        this.timerPausedAt = null;
    }

    public void expire() {
        if (this.timerStatus != TimerStatus.RUNNING) {
            throw new IllegalStateException("Can only expire a RUNNING timer");
        }
        this.timerStatus = TimerStatus.EXPIRED;
        this.remainingSeconds = 0;
    }

    public boolean isExpired() {
        if (timerStatus == TimerStatus.EXPIRED) return true;
        if (timerStatus != TimerStatus.RUNNING) return false;
        return computeElapsedFromStart() <= 0;
    }

    public long computeElapsedFromStart() {
        if (timerStartedAt == null) return durationSeconds;
        long elapsed = java.time.Duration.between(timerStartedAt, Instant.now()).getSeconds();
        return Math.max(0, durationSeconds - elapsed);
    }

    public UUID getId() { return id; }
    public UUID getQuizQuestionId() { return quizQuestionId; }
    public TimerStatus getTimerStatus() { return timerStatus; }
    public int getDurationSeconds() { return durationSeconds; }
    public int getRemainingSeconds() { return remainingSeconds; }
    public Instant getTimerStartedAt() { return timerStartedAt; }
    public Instant getTimerPausedAt() { return timerPausedAt; }
}
