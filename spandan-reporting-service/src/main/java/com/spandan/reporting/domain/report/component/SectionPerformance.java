package com.spandan.reporting.domain.report.component;

public class SectionPerformance {

    private String sectionId;
    private String sectionName;
    private double accuracy;
    private int questionsAttempted;
    private int questionsCorrect;
    private double averageResponseTimeMs;
    private int totalStudents;

    public SectionPerformance() {}

    public SectionPerformance(String sectionId, String sectionName, double accuracy, int questionsAttempted,
                              int questionsCorrect, double averageResponseTimeMs, int totalStudents) {
        this.sectionId = sectionId;
        this.sectionName = sectionName;
        this.accuracy = accuracy;
        this.questionsAttempted = questionsAttempted;
        this.questionsCorrect = questionsCorrect;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.totalStudents = totalStudents;
    }

    public String getSectionId() { return sectionId; }
    public void setSectionId(String sectionId) { this.sectionId = sectionId; }
    public String getSectionName() { return sectionName; }
    public void setSectionName(String sectionName) { this.sectionName = sectionName; }
    public double getAccuracy() { return accuracy; }
    public void setAccuracy(double accuracy) { this.accuracy = accuracy; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int questionsAttempted) { this.questionsAttempted = questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public void setQuestionsCorrect(int questionsCorrect) { this.questionsCorrect = questionsCorrect; }
    public double getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(double averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
}
