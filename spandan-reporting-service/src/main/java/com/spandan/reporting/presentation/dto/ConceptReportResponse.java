package com.spandan.reporting.presentation.dto;

public class ConceptReportResponse {

    private String conceptId;
    private String conceptName;
    private double masteryPct;
    private int totalAttempts;
    private int totalCorrect;
    private int sessionsCovered;
    private double lastAccuracy;
    private String trend;

    public ConceptReportResponse() {}

    public ConceptReportResponse(String conceptId, String conceptName, double masteryPct, int totalAttempts,
                                  int totalCorrect, int sessionsCovered, double lastAccuracy, String trend) {
        this.conceptId = conceptId;
        this.conceptName = conceptName;
        this.masteryPct = masteryPct;
        this.totalAttempts = totalAttempts;
        this.totalCorrect = totalCorrect;
        this.sessionsCovered = sessionsCovered;
        this.lastAccuracy = lastAccuracy;
        this.trend = trend;
    }

    public String getConceptId() { return conceptId; }
    public void setConceptId(String conceptId) { this.conceptId = conceptId; }
    public String getConceptName() { return conceptName; }
    public void setConceptName(String conceptName) { this.conceptName = conceptName; }
    public double getMasteryPct() { return masteryPct; }
    public void setMasteryPct(double masteryPct) { this.masteryPct = masteryPct; }
    public int getTotalAttempts() { return totalAttempts; }
    public void setTotalAttempts(int totalAttempts) { this.totalAttempts = totalAttempts; }
    public int getTotalCorrect() { return totalCorrect; }
    public void setTotalCorrect(int totalCorrect) { this.totalCorrect = totalCorrect; }
    public int getSessionsCovered() { return sessionsCovered; }
    public void setSessionsCovered(int sessionsCovered) { this.sessionsCovered = sessionsCovered; }
    public double getLastAccuracy() { return lastAccuracy; }
    public void setLastAccuracy(double lastAccuracy) { this.lastAccuracy = lastAccuracy; }
    public String getTrend() { return trend; }
    public void setTrend(String trend) { this.trend = trend; }
}
