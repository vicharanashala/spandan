package com.spandan.analytics.domain.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "question_analytics",
       uniqueConstraints = @UniqueConstraint(columnNames = {"quiz_id", "question_id"}))
public class QuestionAnalytics {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "quiz_id", nullable = false)
    private UUID quizId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "responses_received", nullable = false)
    private int responsesReceived;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "incorrect_count", nullable = false)
    private int incorrectCount;

    @Column(name = "skipped_count", nullable = false)
    private int skippedCount;

    @Column(name = "accuracy_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal accuracyPct;

    @Column(name = "average_response_time_seconds", nullable = false, precision = 6, scale = 2)
    private BigDecimal averageResponseTimeSeconds;

    @Column(name = "difficulty_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal difficultyScore;

    public QuestionAnalytics() {}

    public QuestionAnalytics(UUID quizId, UUID questionId, int responsesReceived,
                             int correctCount, int incorrectCount, int skippedCount,
                             BigDecimal accuracyPct, BigDecimal averageResponseTimeSeconds,
                             BigDecimal difficultyScore) {
        this.quizId = quizId;
        this.questionId = questionId;
        this.responsesReceived = responsesReceived;
        this.correctCount = correctCount;
        this.incorrectCount = incorrectCount;
        this.skippedCount = skippedCount;
        this.accuracyPct = accuracyPct;
        this.averageResponseTimeSeconds = averageResponseTimeSeconds;
        this.difficultyScore = difficultyScore;
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public UUID getQuestionId() { return questionId; }
    public int getResponsesReceived() { return responsesReceived; }
    public int getCorrectCount() { return correctCount; }
    public int getIncorrectCount() { return incorrectCount; }
    public int getSkippedCount() { return skippedCount; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public BigDecimal getDifficultyScore() { return difficultyScore; }
}
