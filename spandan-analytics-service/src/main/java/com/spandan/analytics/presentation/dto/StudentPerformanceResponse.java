package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class StudentPerformanceResponse {
    private UUID studentId;
    private int totalAnswered;
    private int correctCount;
    private int incorrectCount;
    private int skippedCount;
    private BigDecimal accuracyPct;
    private BigDecimal totalScore;
    private BigDecimal averageResponseTimeSeconds;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public int getTotalAnswered() { return totalAnswered; }
    public void setTotalAnswered(int totalAnswered) { this.totalAnswered = totalAnswered; }
    public int getCorrectCount() { return correctCount; }
    public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
    public int getIncorrectCount() { return incorrectCount; }
    public void setIncorrectCount(int incorrectCount) { this.incorrectCount = incorrectCount; }
    public int getSkippedCount() { return skippedCount; }
    public void setSkippedCount(int skippedCount) { this.skippedCount = skippedCount; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
    public void setAccuracyPct(BigDecimal accuracyPct) { this.accuracyPct = accuracyPct; }
    public BigDecimal getTotalScore() { return totalScore; }
    public void setTotalScore(BigDecimal totalScore) { this.totalScore = totalScore; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public void setAverageResponseTimeSeconds(BigDecimal averageResponseTimeSeconds) { this.averageResponseTimeSeconds = averageResponseTimeSeconds; }
}
