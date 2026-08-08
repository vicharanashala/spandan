package com.spandan.reporting.domain.report;

import java.util.List;

public class HistoricalReport {

    private String studentId;
    private int totalSessions;
    private double averageAccuracy;
    private double averageParticipationRate;
    private String accuracyTrend;
    private String participationTrend;
    private double lastSessionAccuracy;
    private double lastSessionResponseTimeMs;
    private List<ConceptHistoryEntry> conceptHistory;

    public static class ConceptHistoryEntry {
        private String conceptId;
        private String conceptName;
        private int totalAttempts;
        private int totalCorrect;
        private double masteryPct;
        private int sessionsCovered;
        private double lastAccuracy;

        public ConceptHistoryEntry() {}

        public ConceptHistoryEntry(String conceptId, String conceptName, int totalAttempts, int totalCorrect,
                                   double masteryPct, int sessionsCovered, double lastAccuracy) {
            this.conceptId = conceptId;
            this.conceptName = conceptName;
            this.totalAttempts = totalAttempts;
            this.totalCorrect = totalCorrect;
            this.masteryPct = masteryPct;
            this.sessionsCovered = sessionsCovered;
            this.lastAccuracy = lastAccuracy;
        }

        public String getConceptId() { return conceptId; }
        public void setConceptId(String conceptId) { this.conceptId = conceptId; }
        public String getConceptName() { return conceptName; }
        public void setConceptName(String conceptName) { this.conceptName = conceptName; }
        public int getTotalAttempts() { return totalAttempts; }
        public void setTotalAttempts(int totalAttempts) { this.totalAttempts = totalAttempts; }
        public int getTotalCorrect() { return totalCorrect; }
        public void setTotalCorrect(int totalCorrect) { this.totalCorrect = totalCorrect; }
        public double getMasteryPct() { return masteryPct; }
        public void setMasteryPct(double masteryPct) { this.masteryPct = masteryPct; }
        public int getSessionsCovered() { return sessionsCovered; }
        public void setSessionsCovered(int sessionsCovered) { this.sessionsCovered = sessionsCovered; }
        public double getLastAccuracy() { return lastAccuracy; }
        public void setLastAccuracy(double lastAccuracy) { this.lastAccuracy = lastAccuracy; }
    }

    public HistoricalReport() {}

    public HistoricalReport(String studentId, int totalSessions, double averageAccuracy,
                            double averageParticipationRate, String accuracyTrend, String participationTrend,
                            double lastSessionAccuracy, double lastSessionResponseTimeMs,
                            List<ConceptHistoryEntry> conceptHistory) {
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
    public List<ConceptHistoryEntry> getConceptHistory() { return conceptHistory; }
    public void setConceptHistory(List<ConceptHistoryEntry> conceptHistory) { this.conceptHistory = conceptHistory; }
}
