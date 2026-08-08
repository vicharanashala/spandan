package com.spandan.analytics.domain.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "session_analytics")
public class SessionAnalytics {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "quiz_id", nullable = false, unique = true)
    private UUID quizId;

    @Column(name = "total_questions", nullable = false)
    private int totalQuestions;

    @Column(name = "total_students", nullable = false)
    private int totalStudents;

    @Column(name = "overall_class_accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal overallClassAccuracy;

    @Column(name = "overall_participation_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal overallParticipationRate;

    @Column(name = "average_response_time_seconds", nullable = false, precision = 6, scale = 2)
    private BigDecimal averageResponseTimeSeconds;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public SessionAnalytics() {}

    public SessionAnalytics(UUID quizId, int totalQuestions, int totalStudents,
                            BigDecimal overallClassAccuracy, BigDecimal overallParticipationRate,
                            BigDecimal averageResponseTimeSeconds) {
        this.quizId = quizId;
        this.totalQuestions = totalQuestions;
        this.totalStudents = totalStudents;
        this.overallClassAccuracy = overallClassAccuracy;
        this.overallParticipationRate = overallParticipationRate;
        this.averageResponseTimeSeconds = averageResponseTimeSeconds;
        this.generatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public int getTotalQuestions() { return totalQuestions; }
    public int getTotalStudents() { return totalStudents; }
    public BigDecimal getOverallClassAccuracy() { return overallClassAccuracy; }
    public BigDecimal getOverallParticipationRate() { return overallParticipationRate; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public Instant getGeneratedAt() { return generatedAt; }
}
