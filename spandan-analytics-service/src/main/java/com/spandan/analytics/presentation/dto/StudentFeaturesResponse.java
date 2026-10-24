package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class StudentFeaturesResponse {
    private UUID studentId;
    private int totalQuestionsDisplayed;
    private int totalAnswered;
    private int totalCorrect;
    private int totalIncorrect;
    private int totalTimedOut;
    private BigDecimal participationRate;
    private BigDecimal accuracy;
    private long averageResponseTimeMs;
    private BigDecimal responseTimeConsistency;
    private BigDecimal timeoutPercentage;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public int getTotalQuestionsDisplayed() { return totalQuestionsDisplayed; }
    public void setTotalQuestionsDisplayed(int v) { this.totalQuestionsDisplayed = v; }
    public int getTotalAnswered() { return totalAnswered; }
    public void setTotalAnswered(int v) { this.totalAnswered = v; }
    public int getTotalCorrect() { return totalCorrect; }
    public void setTotalCorrect(int v) { this.totalCorrect = v; }
    public int getTotalIncorrect() { return totalIncorrect; }
    public void setTotalIncorrect(int v) { this.totalIncorrect = v; }
    public int getTotalTimedOut() { return totalTimedOut; }
    public void setTotalTimedOut(int v) { this.totalTimedOut = v; }
    public BigDecimal getParticipationRate() { return participationRate; }
    public void setParticipationRate(BigDecimal v) { this.participationRate = v; }
    public BigDecimal getAccuracy() { return accuracy; }
    public void setAccuracy(BigDecimal v) { this.accuracy = v; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(long v) { this.averageResponseTimeMs = v; }
    public BigDecimal getResponseTimeConsistency() { return responseTimeConsistency; }
    public void setResponseTimeConsistency(BigDecimal v) { this.responseTimeConsistency = v; }
    public BigDecimal getTimeoutPercentage() { return timeoutPercentage; }
    public void setTimeoutPercentage(BigDecimal v) { this.timeoutPercentage = v; }
}
