package com.spandan.polling.infrastructure.persistence.entity;

import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.enums.QuestionStatus;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "quiz_questions",
       uniqueConstraints = @UniqueConstraint(columnNames = {"quiz_id", "sequence_position"}))
public class QuizQuestionEntity {

    @Id
    private UUID id;

    @Column(name = "quiz_id", nullable = false)
    private UUID quizId;

    @Column(name = "question_ref_id", nullable = false)
    private UUID questionRefId;

    @Column(name = "sequence_position", nullable = false)
    private int sequencePosition;

    @Enumerated(EnumType.STRING)
    @Column(name = "question_status", nullable = false, length = 20)
    private QuestionStatus questionStatus;

    @Column(name = "timer_duration_seconds", nullable = false)
    private int timerDurationSeconds;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public QuizQuestionEntity() {}

    public QuizQuestionEntity(UUID id, UUID quizId, UUID questionRefId, int sequencePosition,
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

    public static QuizQuestionEntity fromDomain(QuizQuestion question) {
        return new QuizQuestionEntity(
                question.getId(), question.getQuizId(), question.getQuestionRefId(),
                question.getSequencePosition(), question.getQuestionStatus(),
                question.getTimerDurationSeconds(), question.getPublishedAt(),
                question.getClosedAt(), question.getCancelledAt(),
                question.getCreatedAt(), question.getUpdatedAt()
        );
    }

    public QuizQuestion toDomain() {
        return new QuizQuestion(
                id, quizId, questionRefId, sequencePosition, questionStatus,
                timerDurationSeconds, publishedAt, closedAt, cancelledAt,
                createdAt, updatedAt
        );
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
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
