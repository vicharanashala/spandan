package com.spandan.review.domain.entity;

import com.spandan.review.domain.enums.ReviewStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reviews",
       uniqueConstraints = {
           @UniqueConstraint(columnNames = {"question_id"}),
           @UniqueConstraint(columnNames = {"question_set_id", "question_order"})
       })
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "question_set_id", nullable = false)
    private UUID questionSetId;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "admin_id", nullable = false)
    private UUID adminId;

    @Column(name = "teacher_id")
    private UUID teacherId;

    @Column(name = "original_ai_question", nullable = false, columnDefinition = "TEXT")
    private String originalAiQuestion;

    @Column(name = "question_type", nullable = false)
    private String questionType;

    @Column(name = "edited_question", columnDefinition = "TEXT")
    private String editedQuestion;

    @Column(name = "edited_options", columnDefinition = "JSONB")
    private String editedOptions;

    @Column(name = "edited_correct_answer", columnDefinition = "TEXT")
    private String editedCorrectAnswer;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false)
    private ReviewStatus reviewStatus = ReviewStatus.PENDING_REVIEW;

    @Column(name = "review_comments", columnDefinition = "TEXT")
    private String reviewComments;

    @Column(name = "question_order")
    private Integer questionOrder;

    @Column(name = "saved_flag", nullable = false)
    private boolean savedFlag = false;

    @Version
    @Column(name = "version", nullable = false)
    private int version = 0;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getQuestionId() { return questionId; }
    public void setQuestionId(UUID questionId) { this.questionId = questionId; }
    public UUID getQuestionSetId() { return questionSetId; }
    public void setQuestionSetId(UUID questionSetId) { this.questionSetId = questionSetId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getAdminId() { return adminId; }
    public void setAdminId(UUID adminId) { this.adminId = adminId; }
    public UUID getTeacherId() { return teacherId; }
    public void setTeacherId(UUID teacherId) { this.teacherId = teacherId; }
    public String getOriginalAiQuestion() { return originalAiQuestion; }
    public void setOriginalAiQuestion(String originalAiQuestion) { this.originalAiQuestion = originalAiQuestion; }
    public String getQuestionType() { return questionType; }
    public void setQuestionType(String questionType) { this.questionType = questionType; }
    public String getEditedQuestion() { return editedQuestion; }
    public void setEditedQuestion(String editedQuestion) { this.editedQuestion = editedQuestion; }
    public String getEditedOptions() { return editedOptions; }
    public void setEditedOptions(String editedOptions) { this.editedOptions = editedOptions; }
    public String getEditedCorrectAnswer() { return editedCorrectAnswer; }
    public void setEditedCorrectAnswer(String editedCorrectAnswer) { this.editedCorrectAnswer = editedCorrectAnswer; }
    public ReviewStatus getReviewStatus() { return reviewStatus; }
    public void setReviewStatus(ReviewStatus reviewStatus) { this.reviewStatus = reviewStatus; }
    public String getReviewComments() { return reviewComments; }
    public void setReviewComments(String reviewComments) { this.reviewComments = reviewComments; }
    public Integer getQuestionOrder() { return questionOrder; }
    public void setQuestionOrder(Integer questionOrder) { this.questionOrder = questionOrder; }
    public boolean isSavedFlag() { return savedFlag; }
    public void setSavedFlag(boolean savedFlag) { this.savedFlag = savedFlag; }
    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
