package com.spandan.questiongen.domain.entity;

import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.enums.ReviewStatus;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "generated_questions")
public class GeneratedQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_set_id", nullable = false, foreignKey = @ForeignKey(name = "fk_gq_question_set"))
    private QuestionSet questionSet;

    @Enumerated(EnumType.STRING)
    @Column(name = "question_type", nullable = false)
    private QuestionType questionType;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(name = "options", columnDefinition = "JSONB")
    private String options;

    @Column(name = "correct_answer", nullable = false, columnDefinition = "TEXT")
    private String correctAnswer;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false)
    private ReviewStatus reviewStatus = ReviewStatus.PENDING_REVIEW;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public QuestionSet getQuestionSet() { return questionSet; }
    public void setQuestionSet(QuestionSet questionSet) { this.questionSet = questionSet; }
    public QuestionType getQuestionType() { return questionType; }
    public void setQuestionType(QuestionType questionType) { this.questionType = questionType; }
    public String getQuestionText() { return questionText; }
    public void setQuestionText(String questionText) { this.questionText = questionText; }
    public String getOptions() { return options; }
    public void setOptions(String options) { this.options = options; }
    public String getCorrectAnswer() { return correctAnswer; }
    public void setCorrectAnswer(String correctAnswer) { this.correctAnswer = correctAnswer; }
    public ReviewStatus getReviewStatus() { return reviewStatus; }
    public void setReviewStatus(ReviewStatus reviewStatus) { this.reviewStatus = reviewStatus; }
}
