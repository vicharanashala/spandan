package com.spandan.polling.domain.entity;

import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.TimerStatus;

import java.time.Instant;
import java.util.UUID;

public class QuizQuestion {

    private final UUID id;
    private final UUID quizId;
    private final UUID questionRefId;
    private final int sequencePosition;
    private QuestionStatus questionStatus;
    private final int timerDurationSeconds;
    private Instant publishedAt;
    private Instant closedAt;
    private Instant cancelledAt;
    private final Instant createdAt;
    private Instant updatedAt;

    public QuizQuestion(UUID id, UUID quizId, UUID questionRefId, int sequencePosition,
                        QuestionStatus questionStatus, int timerDurationSeconds,
                        Instant publishedAt, Instant closedAt, Instant cancelledAt,
                        Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.quizId = quizId;
        this.questionRefId = questionRefId;
        this.sequencePosition = sequencePosition;
        this.questionStatus = questionStatus;
        this.timerDurationSeconds = timerDurationSeconds;
        this.publishedAt = publishedAt;
        this.closedAt = closedAt;
        this.cancelledAt = cancelledAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static QuizQuestion create(UUID quizId, UUID questionRefId,
                                       int sequencePosition, int timerDurationSeconds) {
        Instant now = Instant.now();
        return new QuizQuestion(
                UUID.randomUUID(), quizId, questionRefId, sequencePosition,
                QuestionStatus.SCHEDULED, timerDurationSeconds,
                null, null, null, now, now
        );
    }

    public void publish() {
        assertTransition(QuestionStatus.PUBLISHED);
        this.questionStatus = QuestionStatus.PUBLISHED;
        this.publishedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void startTimer() {
        assertTransition(QuestionStatus.RUNNING);
        this.questionStatus = QuestionStatus.RUNNING;
        this.updatedAt = Instant.now();
    }

    public void expireTimer() {
        assertTransition(QuestionStatus.TIMER_EXPIRED);
        this.questionStatus = QuestionStatus.TIMER_EXPIRED;
        this.updatedAt = Instant.now();
    }

    public void close() {
        assertTransition(QuestionStatus.CLOSED);
        this.questionStatus = QuestionStatus.CLOSED;
        this.closedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void cancel() {
        assertTransition(QuestionStatus.CANCELLED);
        this.questionStatus = QuestionStatus.CANCELLED;
        this.cancelledAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public boolean isScheduled() {
        return questionStatus == QuestionStatus.SCHEDULED;
    }

    public boolean isPublished() {
        return questionStatus == QuestionStatus.PUBLISHED;
    }

    public boolean isRunning() {
        return questionStatus == QuestionStatus.RUNNING;
    }

    public boolean isTerminal() {
        return questionStatus == QuestionStatus.CLOSED
                || questionStatus == QuestionStatus.CANCELLED
                || questionStatus == QuestionStatus.TIMER_EXPIRED;
    }

    public boolean isBeforeOrAtCurrent() {
        return questionStatus == QuestionStatus.PUBLISHED
                || questionStatus == QuestionStatus.RUNNING
                || questionStatus == QuestionStatus.TIMER_EXPIRED
                || questionStatus == QuestionStatus.CLOSED;
    }

    public TimerStatus deriveTimerStatus() {
        return switch (questionStatus) {
            case SCHEDULED, CANCELLED -> TimerStatus.NOT_STARTED;
            case PUBLISHED, RUNNING -> TimerStatus.RUNNING;
            case TIMER_EXPIRED -> TimerStatus.EXPIRED;
            case CLOSED -> TimerStatus.EXPIRED;
        };
    }

    private void assertTransition(QuestionStatus target) {
        if (!canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Cannot transition question from " + questionStatus + " to " + target);
        }
    }

    private boolean canTransitionTo(QuestionStatus target) {
        return switch (target) {
            case PUBLISHED -> questionStatus == QuestionStatus.SCHEDULED;
            case RUNNING -> questionStatus == QuestionStatus.PUBLISHED;
            case TIMER_EXPIRED -> questionStatus == QuestionStatus.RUNNING;
            case CLOSED -> questionStatus == QuestionStatus.TIMER_EXPIRED;
            case CANCELLED -> questionStatus == QuestionStatus.SCHEDULED;
            default -> false;
        };
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public UUID getQuestionRefId() { return questionRefId; }
    public int getSequencePosition() { return sequencePosition; }
    public QuestionStatus getQuestionStatus() { return questionStatus; }
    public int getTimerDurationSeconds() { return timerDurationSeconds; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getClosedAt() { return closedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
