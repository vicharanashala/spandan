package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class EngagementMetricsResponse {

    private UUID studentId;
    private String responseTimeTrend;
    private BigDecimal timeoutRate;
    private BigDecimal participationRate;
    private String engagementLevel;
    private int totalAnswered;
    private int totalDisplayed;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public String getResponseTimeTrend() { return responseTimeTrend; }
    public void setResponseTimeTrend(String responseTimeTrend) { this.responseTimeTrend = responseTimeTrend; }
    public BigDecimal getTimeoutRate() { return timeoutRate; }
    public void setTimeoutRate(BigDecimal timeoutRate) { this.timeoutRate = timeoutRate; }
    public BigDecimal getParticipationRate() { return participationRate; }
    public void setParticipationRate(BigDecimal participationRate) { this.participationRate = participationRate; }
    public String getEngagementLevel() { return engagementLevel; }
    public void setEngagementLevel(String engagementLevel) { this.engagementLevel = engagementLevel; }
    public int getTotalAnswered() { return totalAnswered; }
    public void setTotalAnswered(int totalAnswered) { this.totalAnswered = totalAnswered; }
    public int getTotalDisplayed() { return totalDisplayed; }
    public void setTotalDisplayed(int totalDisplayed) { this.totalDisplayed = totalDisplayed; }
}
