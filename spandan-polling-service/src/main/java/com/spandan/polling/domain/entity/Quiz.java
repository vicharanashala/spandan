package com.spandan.polling.domain.entity;

import com.spandan.polling.domain.enums.QuizStatus;

import java.time.Instant;
import java.util.UUID;

public class Quiz {

    private final UUID id;
    private final UUID teacherId;
    private QuizStatus quizStatus;
    private int currentQuestionNumber;
    private final int totalQuestions;
    private final UUID lectureId;
    private final UUID sectionId;
    private final UUID subsectionId;
    private Instant startedAt;
    private Instant endedAt;
    private final Instant createdAt;
    private Instant updatedAt;

    public Quiz(UUID id, UUID teacherId, QuizStatus quizStatus, int currentQuestionNumber,
                int totalQuestions, UUID lectureId, UUID sectionId, UUID subsectionId,
                Instant startedAt, Instant endedAt,
                Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.teacherId = teacherId;
        this.quizStatus = quizStatus;
        this.currentQuestionNumber = currentQuestionNumber;
        this.totalQuestions = totalQuestions;
        this.lectureId = lectureId;
        this.sectionId = sectionId;
        this.subsectionId = subsectionId;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static Quiz create(UUID teacherId, int totalQuestions) {
        return create(teacherId, totalQuestions, null, null, null);
    }

    public static Quiz create(UUID teacherId, int totalQuestions,
                               UUID lectureId, UUID sectionId, UUID subsectionId) {
        Instant now = Instant.now();
        return new Quiz(
                UUID.randomUUID(), teacherId, QuizStatus.DRAFT,
                0, totalQuestions, lectureId, sectionId, subsectionId,
                null, null, now, now
        );
    }

    public void markScheduled() {
        assertTransition(quizStatus, QuizStatus.SCHEDULED);
        this.quizStatus = QuizStatus.SCHEDULED;
        this.updatedAt = Instant.now();
    }

    public void start(UUID firstQuestionId) {
        assertTransition(quizStatus, QuizStatus.RUNNING);
        this.quizStatus = QuizStatus.RUNNING;
        this.currentQuestionNumber = 1;
        this.startedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void pause() {
        assertTransition(quizStatus, QuizStatus.PAUSED);
        this.quizStatus = QuizStatus.PAUSED;
        this.updatedAt = Instant.now();
    }

    public void resume() {
        assertTransition(quizStatus, QuizStatus.RUNNING);
        this.quizStatus = QuizStatus.RUNNING;
        this.updatedAt = Instant.now();
    }

    public void advanceToNextQuestion() {
        if (this.currentQuestionNumber >= this.totalQuestions) {
            this.quizStatus = QuizStatus.COMPLETED;
            this.endedAt = Instant.now();
        } else {
            this.currentQuestionNumber++;
        }
        this.updatedAt = Instant.now();
    }

    public void complete() {
        assertTransition(quizStatus, QuizStatus.COMPLETED);
        this.quizStatus = QuizStatus.COMPLETED;
        this.endedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void cancel() {
        assertTransition(quizStatus, QuizStatus.CANCELLED);
        this.quizStatus = QuizStatus.CANCELLED;
        this.endedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public boolean isRunning() {
        return quizStatus == QuizStatus.RUNNING;
    }

    public boolean isPaused() {
        return quizStatus == QuizStatus.PAUSED;
    }

    public boolean isTerminal() {
        return quizStatus == QuizStatus.COMPLETED || quizStatus == QuizStatus.CANCELLED;
    }

    public boolean isLastQuestion() {
        return currentQuestionNumber >= totalQuestions;
    }

    private void assertTransition(QuizStatus current, QuizStatus target) {
        if (!canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Cannot transition quiz from " + current + " to " + target);
        }
    }

    private boolean canTransitionTo(QuizStatus target) {
        return switch (target) {
            case SCHEDULED -> quizStatus == QuizStatus.DRAFT;
            case RUNNING -> quizStatus == QuizStatus.SCHEDULED || quizStatus == QuizStatus.PAUSED;
            case PAUSED -> quizStatus == QuizStatus.RUNNING;
            case COMPLETED -> quizStatus == QuizStatus.RUNNING;
            case CANCELLED -> quizStatus == QuizStatus.DRAFT
                    || quizStatus == QuizStatus.SCHEDULED
                    || quizStatus == QuizStatus.RUNNING
                    || quizStatus == QuizStatus.PAUSED;
            default -> false;
        };
    }

    public UUID getId() { return id; }
    public UUID getTeacherId() { return teacherId; }
    public QuizStatus getQuizStatus() { return quizStatus; }
    public int getCurrentQuestionNumber() { return currentQuestionNumber; }
    public int getTotalQuestions() { return totalQuestions; }
    public UUID getLectureId() { return lectureId; }
    public UUID getSectionId() { return sectionId; }
    public UUID getSubsectionId() { return subsectionId; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
