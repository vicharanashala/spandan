package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public class SessionAnalyticsResponse {
    private UUID quizId;
    private int totalQuestions;
    private int totalStudents;
    private BigDecimal overallClassAccuracy;
    private BigDecimal overallParticipationRate;
    private BigDecimal averageResponseTimeSeconds;
    private Instant generatedAt;

    public UUID getQuizId() { return quizId; }
    public void setQuizId(UUID quizId) { this.quizId = quizId; }
    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
    public BigDecimal getOverallClassAccuracy() { return overallClassAccuracy; }
    public void setOverallClassAccuracy(BigDecimal overallClassAccuracy) { this.overallClassAccuracy = overallClassAccuracy; }
    public BigDecimal getOverallParticipationRate() { return overallParticipationRate; }
    public void setOverallParticipationRate(BigDecimal overallParticipationRate) { this.overallParticipationRate = overallParticipationRate; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public void setAverageResponseTimeSeconds(BigDecimal averageResponseTimeSeconds) { this.averageResponseTimeSeconds = averageResponseTimeSeconds; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
}
