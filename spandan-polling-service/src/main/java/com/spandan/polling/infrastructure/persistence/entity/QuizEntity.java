package com.spandan.polling.infrastructure.persistence.entity;

import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.enums.QuizStatus;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "quizzes")
public class QuizEntity {

    @Id
    private UUID id;

    @Column(name = "teacher_id", nullable = false)
    private UUID teacherId;

    @Enumerated(EnumType.STRING)
    @Column(name = "quiz_status", nullable = false, length = 20)
    private QuizStatus quizStatus;

    @Column(name = "current_question_number", nullable = false)
    private int currentQuestionNumber;

    @Column(name = "total_questions", nullable = false)
    private int totalQuestions;

    @Column(name = "lecture_id")
    private UUID lectureId;

    @Column(name = "section_id")
    private UUID sectionId;

    @Column(name = "subsection_id")
    private UUID subsectionId;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public QuizEntity() {}

    public QuizEntity(UUID id, UUID teacherId, QuizStatus quizStatus, int currentQuestionNumber,
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

    public static QuizEntity fromDomain(Quiz quiz) {
        return new QuizEntity(
                quiz.getId(), quiz.getTeacherId(), quiz.getQuizStatus(),
                quiz.getCurrentQuestionNumber(), quiz.getTotalQuestions(),
                quiz.getLectureId(), quiz.getSectionId(), quiz.getSubsectionId(),
                quiz.getStartedAt(), quiz.getEndedAt(),
                quiz.getCreatedAt(), quiz.getUpdatedAt()
        );
    }

    public Quiz toDomain() {
        return new Quiz(
                id, teacherId, quizStatus, currentQuestionNumber, totalQuestions,
                lectureId, sectionId, subsectionId,
                startedAt, endedAt, createdAt, updatedAt
        );
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
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
