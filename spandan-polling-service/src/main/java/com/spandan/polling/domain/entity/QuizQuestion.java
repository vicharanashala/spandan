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
    private final UUID lectureId;
    private final UUID sectionId;
    private final UUID subsectionId;
    private final UUID topicId;
    private final UUID conceptId;
    private final UUID learningObjectiveId;
    private final String difficulty;
    private final String questionType;
    private final String correctAnswer;
    private Instant pollOpenedAt;
    private Instant pollClosedAt;
    private Instant cancelledAt;
    private final Instant createdAt;
    private Instant updatedAt;

    public QuizQuestion(UUID id, UUID quizId, UUID questionRefId, int sequencePosition,
                        QuestionStatus questionStatus, int timerDurationSeconds,
                        UUID lectureId, UUID sectionId, UUID subsectionId,
                        UUID topicId, UUID conceptId, UUID learningObjectiveId,
                        String difficulty, String questionType, String correctAnswer,
                        Instant pollOpenedAt, Instant pollClosedAt, Instant cancelledAt,
                        Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.quizId = quizId;
        this.questionRefId = questionRefId;
        this.sequencePosition = sequencePosition;
        this.questionStatus = questionStatus;
        this.timerDurationSeconds = timerDurationSeconds;
        this.lectureId = lectureId;
        this.sectionId = sectionId;
        this.subsectionId = subsectionId;
        this.topicId = topicId;
        this.conceptId = conceptId;
        this.learningObjectiveId = learningObjectiveId;
        this.difficulty = difficulty;
        this.questionType = questionType;
        this.correctAnswer = correctAnswer;
        this.pollOpenedAt = pollOpenedAt;
        this.pollClosedAt = pollClosedAt;
        this.cancelledAt = cancelledAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static QuizQuestion create(UUID quizId, UUID questionRefId,
                                       int sequencePosition, int timerDurationSeconds) {
        return create(quizId, questionRefId, sequencePosition, timerDurationSeconds,
                null, null, null, null, null, null,
                null, null, null);
    }

    public static QuizQuestion create(UUID quizId, UUID questionRefId,
                                       int sequencePosition, int timerDurationSeconds,
                                       UUID lectureId, UUID sectionId, UUID subsectionId,
                                       UUID topicId, UUID conceptId, UUID learningObjectiveId,
                                       String difficulty, String questionType, String correctAnswer) {
        Instant now = Instant.now();
        return new QuizQuestion(
                UUID.randomUUID(), quizId, questionRefId, sequencePosition,
                QuestionStatus.SCHEDULED, timerDurationSeconds,
                lectureId, sectionId, subsectionId,
                topicId, conceptId, learningObjectiveId,
                difficulty, questionType, correctAnswer,
                null, null, null, now, now
        );
    }

    public void openPoll() {
        assertTransition(QuestionStatus.POLL_OPEN);
        this.questionStatus = QuestionStatus.POLL_OPEN;
        this.pollOpenedAt = Instant.now();
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

    public void closePoll() {
        assertTransition(QuestionStatus.POLL_CLOSED);
        this.questionStatus = QuestionStatus.POLL_CLOSED;
        this.pollClosedAt = Instant.now();
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

    public boolean isPollOpen() {
        return questionStatus == QuestionStatus.POLL_OPEN;
    }

    public boolean isRunning() {
        return questionStatus == QuestionStatus.RUNNING;
    }

    public boolean isPollClosed() {
        return questionStatus == QuestionStatus.POLL_CLOSED;
    }

    public boolean isTerminal() {
        return questionStatus == QuestionStatus.POLL_CLOSED
                || questionStatus == QuestionStatus.CANCELLED
                || questionStatus == QuestionStatus.TIMER_EXPIRED
                || questionStatus == QuestionStatus.CLOSED;
    }

    public boolean isBeforeOrAtCurrent() {
        return questionStatus == QuestionStatus.POLL_OPEN
                || questionStatus == QuestionStatus.PUBLISHED
                || questionStatus == QuestionStatus.RUNNING
                || questionStatus == QuestionStatus.TIMER_EXPIRED
                || questionStatus == QuestionStatus.POLL_CLOSED
                || questionStatus == QuestionStatus.CLOSED;
    }

    public TimerStatus deriveTimerStatus() {
        return switch (questionStatus) {
            case SCHEDULED, CANCELLED -> TimerStatus.NOT_STARTED;
            case PUBLISHED, POLL_OPEN, RUNNING -> TimerStatus.RUNNING;
            case TIMER_EXPIRED, CLOSED, POLL_CLOSED -> TimerStatus.EXPIRED;
        };
    }

    public boolean hasHierarchyContext() {
        return lectureId != null;
    }

    private void assertTransition(QuestionStatus target) {
        if (!canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Cannot transition question from " + questionStatus + " to " + target);
        }
    }

    private boolean canTransitionTo(QuestionStatus target) {
        return switch (target) {
            case SCHEDULED -> false;
            case PUBLISHED -> questionStatus == QuestionStatus.SCHEDULED;
            case POLL_OPEN -> questionStatus == QuestionStatus.SCHEDULED;
            case RUNNING -> questionStatus == QuestionStatus.PUBLISHED
                    || questionStatus == QuestionStatus.POLL_OPEN;
            case TIMER_EXPIRED -> questionStatus == QuestionStatus.RUNNING
                    || questionStatus == QuestionStatus.POLL_OPEN;
            case CLOSED -> questionStatus == QuestionStatus.TIMER_EXPIRED;
            case POLL_CLOSED -> questionStatus == QuestionStatus.TIMER_EXPIRED
                    || questionStatus == QuestionStatus.CLOSED
                    || questionStatus == QuestionStatus.POLL_OPEN
                    || questionStatus == QuestionStatus.PUBLISHED;
            case CANCELLED -> questionStatus == QuestionStatus.SCHEDULED;
        };
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public UUID getQuestionRefId() { return questionRefId; }
    public int getSequencePosition() { return sequencePosition; }
    public QuestionStatus getQuestionStatus() { return questionStatus; }
    public int getTimerDurationSeconds() { return timerDurationSeconds; }
    public UUID getLectureId() { return lectureId; }
    public UUID getSectionId() { return sectionId; }
    public UUID getSubsectionId() { return subsectionId; }
    public UUID getTopicId() { return topicId; }
    public UUID getConceptId() { return conceptId; }
    public UUID getLearningObjectiveId() { return learningObjectiveId; }
    public String getDifficulty() { return difficulty; }
    public String getQuestionType() { return questionType; }
    public String getCorrectAnswer() { return correctAnswer; }
    public Instant getPollOpenedAt() { return pollOpenedAt; }
    public Instant getPollClosedAt() { return pollClosedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
