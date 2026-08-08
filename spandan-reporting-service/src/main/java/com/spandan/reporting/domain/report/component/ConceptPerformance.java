package com.spandan.reporting.domain.report.component;

public class ConceptPerformance {

    private String conceptId;
    private String conceptName;
    private double accuracy;
    private int questionsAttempted;
    private int questionsCorrect;
    private double averageResponseTimeMs;
    private String trend;

    public ConceptPerformance() {}

    public ConceptPerformance(String conceptId, String conceptName, double accuracy, int questionsAttempted,
                              int questionsCorrect, double averageResponseTimeMs, String trend) {
        this.conceptId = conceptId;
        this.conceptName = conceptName;
        this.accuracy = accuracy;
        this.questionsAttempted = questionsAttempted;
        this.questionsCorrect = questionsCorrect;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.trend = trend;
    }

    public String getConceptId() { return conceptId; }
    public void setConceptId(String conceptId) { this.conceptId = conceptId; }
    public String getConceptName() { return conceptName; }
    public void setConceptName(String conceptName) { this.conceptName = conceptName; }
    public double getAccuracy() { return accuracy; }
    public void setAccuracy(double accuracy) { this.accuracy = accuracy; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int questionsAttempted) { this.questionsAttempted = questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public void setQuestionsCorrect(int questionsCorrect) { this.questionsCorrect = questionsCorrect; }
    public double getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(double averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
    public String getTrend() { return trend; }
    public void setTrend(String trend) { this.trend = trend; }
}
