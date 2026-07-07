package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class HistoricalReportResponse {

    private String studentId;
    private int totalSessions;
    private double averageAccuracy;
    private double averageParticipationRate;
    private String accuracyTrend;
    private String participationTrend;
    private double lastSessionAccuracy;
    private double lastSessionResponseTimeMs;
    private List<Map<String, Object>> conceptHistory;

    public HistoricalReportResponse() {}

    public HistoricalReportResponse(String studentId, int totalSessions, double averageAccuracy,
                                     double averageParticipationRate, String accuracyTrend,
                                     String participationTrend, double lastSessionAccuracy,
                                     double lastSessionResponseTimeMs, List<Map<String, Object>> conceptHistory) {
        this.studentId = studentId;
        this.totalSessions = totalSessions;
        this.averageAccuracy = averageAccuracy;
        this.averageParticipationRate = averageParticipationRate;
        this.accuracyTrend = accuracyTrend;
        this.participationTrend = participationTrend;
        this.lastSessionAccuracy = lastSessionAccuracy;
        this.lastSessionResponseTimeMs = lastSessionResponseTimeMs;
        this.conceptHistory = conceptHistory;
    }

    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public int getTotalSessions() { return totalSessions; }
    public void setTotalSessions(int totalSessions) { this.totalSessions = totalSessions; }
    public double getAverageAccuracy() { return averageAccuracy; }
    public void setAverageAccuracy(double averageAccuracy) { this.averageAccuracy = averageAccuracy; }
    public double getAverageParticipationRate() { return averageParticipationRate; }
    public void setAverageParticipationRate(double averageParticipationRate) { this.averageParticipationRate = averageParticipationRate; }
    public String getAccuracyTrend() { return accuracyTrend; }
    public void setAccuracyTrend(String accuracyTrend) { this.accuracyTrend = accuracyTrend; }
    public String getParticipationTrend() { return participationTrend; }
    public void setParticipationTrend(String participationTrend) { this.participationTrend = participationTrend; }
    public double getLastSessionAccuracy() { return lastSessionAccuracy; }
    public void setLastSessionAccuracy(double lastSessionAccuracy) { this.lastSessionAccuracy = lastSessionAccuracy; }
    public double getLastSessionResponseTimeMs() { return lastSessionResponseTimeMs; }
    public void setLastSessionResponseTimeMs(double lastSessionResponseTimeMs) { this.lastSessionResponseTimeMs = lastSessionResponseTimeMs; }
    public List<Map<String, Object>> getConceptHistory() { return conceptHistory; }
    public void setConceptHistory(List<Map<String, Object>> conceptHistory) { this.conceptHistory = conceptHistory; }
}
