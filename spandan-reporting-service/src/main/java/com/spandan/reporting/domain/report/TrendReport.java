package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.PerformanceSummary;

import java.util.List;

public class TrendReport {

    private String studentId;
    private List<String> sessionIds;
    private String accuracyTrend;
    private String participationTrend;
    private String responseTimeTrend;
    private List<SessionSnapshot> sessionPerformance;

    public static class SessionSnapshot {
        private String sessionId;
        private PerformanceSummary performance;
        private double participationRate;
        private String generatedAt;

        public SessionSnapshot() {}

        public SessionSnapshot(String sessionId, PerformanceSummary performance,
                               double participationRate, String generatedAt) {
            this.sessionId = sessionId;
            this.performance = performance;
            this.participationRate = participationRate;
            this.generatedAt = generatedAt;
        }

        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }
        public PerformanceSummary getPerformance() { return performance; }
        public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
        public double getParticipationRate() { return participationRate; }
        public void setParticipationRate(double participationRate) { this.participationRate = participationRate; }
        public String getGeneratedAt() { return generatedAt; }
        public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }
    }

    public TrendReport() {}

    public TrendReport(String studentId, List<String> sessionIds, String accuracyTrend,
                       String participationTrend, String responseTimeTrend,
                       List<SessionSnapshot> sessionPerformance) {
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
    public List<SessionSnapshot> getSessionPerformance() { return sessionPerformance; }
    public void setSessionPerformance(List<SessionSnapshot> sessionPerformance) { this.sessionPerformance = sessionPerformance; }
}
