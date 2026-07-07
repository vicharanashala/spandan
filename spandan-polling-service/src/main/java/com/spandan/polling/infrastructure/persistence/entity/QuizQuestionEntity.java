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

    @Column(name = "lecture_id")
    private UUID lectureId;

    @Column(name = "section_id")
    private UUID sectionId;

    @Column(name = "subsection_id")
    private UUID subsectionId;

    @Column(name = "topic_id")
    private UUID topicId;

    @Column(name = "concept_id")
    private UUID conceptId;

    @Column(name = "learning_objective_id")
    private UUID learningObjectiveId;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    @Column(name = "question_type", length = 30)
    private String questionType;

    @Column(name = "correct_answer", length = 500)
    private String correctAnswer;

    @Column(name = "poll_opened_at")
    private Instant pollOpenedAt;

    @Column(name = "poll_closed_at")
    private Instant pollClosedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public QuizQuestionEntity() {}

    public QuizQuestionEntity(UUID id, UUID quizId, UUID questionRefId, int sequencePosition,
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

    public static QuizQuestionEntity fromDomain(QuizQuestion question) {
        return new QuizQuestionEntity(
                question.getId(), question.getQuizId(), question.getQuestionRefId(),
                question.getSequencePosition(), question.getQuestionStatus(),
                question.getTimerDurationSeconds(),
                question.getLectureId(), question.getSectionId(), question.getSubsectionId(),
                question.getTopicId(), question.getConceptId(), question.getLearningObjectiveId(),
                question.getDifficulty(), question.getQuestionType(), question.getCorrectAnswer(),
                question.getPollOpenedAt(), question.getPollClosedAt(), question.getCancelledAt(),
                question.getCreatedAt(), question.getUpdatedAt()
        );
    }

    public QuizQuestion toDomain() {
        return new QuizQuestion(
                id, quizId, questionRefId, sequencePosition, questionStatus,
                timerDurationSeconds,
                lectureId, sectionId, subsectionId,
                topicId, conceptId, learningObjectiveId,
                difficulty, questionType, correctAnswer,
                pollOpenedAt, pollClosedAt, cancelledAt,
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
