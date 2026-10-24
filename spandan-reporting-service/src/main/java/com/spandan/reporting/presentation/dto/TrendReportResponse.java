package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class TrendReportResponse {

    private String studentId;
    private List<String> sessionIds;
    private String accuracyTrend;
    private String participationTrend;
    private String responseTimeTrend;
    private List<Map<String, Object>> sessionPerformance;

    public TrendReportResponse() {}

    public TrendReportResponse(String studentId, List<String> sessionIds, String accuracyTrend,
                                String participationTrend, String responseTimeTrend,
                                List<Map<String, Object>> sessionPerformance) {
        this.studentId = studentId;
        this.sessionIds = sessionIds;
        this.accuracyTrend = accuracyTrend;
        this.participationTrend = participationTrend;
        this.responseTimeTrend = responseTimeTrend;
        this.sessionPerformance = sessionPerformance;
    }

    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public List<String> getSessionIds() { return sessionIds; }
    public void setSessionIds(List<String> sessionIds) { this.sessionIds = sessionIds; }
    public String getAccuracyTrend() { return accuracyTrend; }
    public void setAccuracyTrend(String accuracyTrend) { this.accuracyTrend = accuracyTrend; }
    public String getParticipationTrend() { return participationTrend; }
    public void setParticipationTrend(String participationTrend) { this.participationTrend = participationTrend; }
    public String getResponseTimeTrend() { return responseTimeTrend; }
    public void setResponseTimeTrend(String responseTimeTrend) { this.responseTimeTrend = responseTimeTrend; }
    public List<Map<String, Object>> getSessionPerformance() { return sessionPerformance; }
    public void setSessionPerformance(List<Map<String, Object>> sessionPerformance) { this.sessionPerformance = sessionPerformance; }
}
