package com.spandan.analytics.domain.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "student_performance",
       uniqueConstraints = @UniqueConstraint(columnNames = {"quiz_id", "student_id"}))
public class StudentPerformance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "quiz_id", nullable = false)
    private UUID quizId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "total_answered", nullable = false)
    private int totalAnswered;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "incorrect_count", nullable = false)
    private int incorrectCount;

    @Column(name = "skipped_count", nullable = false)
    private int skippedCount;

    @Column(name = "accuracy_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal accuracyPct;

    @Column(name = "total_score", nullable = false, precision = 8, scale = 2)
    private BigDecimal totalScore;

    @Column(name = "average_response_time_seconds", nullable = false, precision = 6, scale = 2)
    private BigDecimal averageResponseTimeSeconds;

    public StudentPerformance() {}

    public StudentPerformance(UUID quizId, UUID studentId, int totalAnswered,
                              int correctCount, int incorrectCount, int skippedCount,
                              BigDecimal accuracyPct, BigDecimal totalScore,
                              BigDecimal averageResponseTimeSeconds) {
        this.quizId = quizId;
        this.studentId = studentId;
        this.totalAnswered = totalAnswered;
        this.correctCount = correctCount;
        this.incorrectCount = incorrectCount;
        this.skippedCount = skippedCount;
        this.accuracyPct = accuracyPct;
        this.totalScore = totalScore;
        this.averageResponseTimeSeconds = averageResponseTimeSeconds;
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public UUID getStudentId() { return studentId; }
    public int getTotalAnswered() { return totalAnswered; }
    public int getCorrectCount() { return correctCount; }
    public int getIncorrectCount() { return incorrectCount; }
    public int getSkippedCount() { return skippedCount; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
    public BigDecimal getTotalScore() { return totalScore; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
}
