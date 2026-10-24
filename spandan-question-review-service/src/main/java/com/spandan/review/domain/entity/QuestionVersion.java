package com.spandan.review.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "question_versions",
       uniqueConstraints = @UniqueConstraint(columnNames = {"review_id", "version_number"}))
public class QuestionVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "review_id", nullable = false, foreignKey = @ForeignKey(name = "fk_qv_review"))
    private Review review;

    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(name = "options", columnDefinition = "JSONB")
    private String options;

    @Column(name = "correct_answer", nullable = false, columnDefinition = "TEXT")
    private String correctAnswer;

    @Column(name = "edited_by_admin_id")
    private UUID editedByAdminId;

    @Column(name = "edited_at", nullable = false)
    private Instant editedAt;

    @PrePersist
    protected void onCreate() {
        editedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Review getReview() { return review; }
    public void setReview(Review review) { this.review = review; }
    public int getVersionNumber() { return versionNumber; }
    public void setVersionNumber(int versionNumber) { this.versionNumber = versionNumber; }
    public String getQuestionText() { return questionText; }
    public void setQuestionText(String questionText) { this.questionText = questionText; }
    public String getOptions() { return options; }
    public void setOptions(String options) { this.options = options; }
    public String getCorrectAnswer() { return correctAnswer; }
    public void setCorrectAnswer(String correctAnswer) { this.correctAnswer = correctAnswer; }
    public UUID getEditedByAdminId() { return editedByAdminId; }
    public void setEditedByAdminId(UUID editedByAdminId) { this.editedByAdminId = editedByAdminId; }
    public Instant getEditedAt() { return editedAt; }
}
