package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class HistoricalPerformanceResponse {
    private UUID studentId;
    private int totalSessions;
    private BigDecimal averageAccuracy;
    private BigDecimal averageParticipationRate;
    private String accuracyTrend;
    private String participationTrend;
    private long averageResponseTimeMs;
    private BigDecimal lastSessionAccuracy;
    private long lastSessionResponseTimeMs;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID v) { this.studentId = v; }
    public int getTotalSessions() { return totalSessions; }
    public void setTotalSessions(int v) { this.totalSessions = v; }
    public BigDecimal getAverageAccuracy() { return averageAccuracy; }
    public void setAverageAccuracy(BigDecimal v) { this.averageAccuracy = v; }
    public BigDecimal getAverageParticipationRate() { return averageParticipationRate; }
    public void setAverageParticipationRate(BigDecimal v) { this.averageParticipationRate = v; }
    public String getAccuracyTrend() { return accuracyTrend; }
    public void setAccuracyTrend(String v) { this.accuracyTrend = v; }
    public String getParticipationTrend() { return participationTrend; }
    public void setParticipationTrend(String v) { this.participationTrend = v; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(long v) { this.averageResponseTimeMs = v; }
    public BigDecimal getLastSessionAccuracy() { return lastSessionAccuracy; }
    public void setLastSessionAccuracy(BigDecimal v) { this.lastSessionAccuracy = v; }
    public long getLastSessionResponseTimeMs() { return lastSessionResponseTimeMs; }
    public void setLastSessionResponseTimeMs(long v) { this.lastSessionResponseTimeMs = v; }
}
