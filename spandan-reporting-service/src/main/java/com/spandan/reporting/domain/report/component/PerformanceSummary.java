package com.spandan.reporting.domain.report.component;

public class PerformanceSummary {

    private double overallAccuracy;
    private double averageResponseTimeMs;
    private int totalQuestions;
    private int totalCorrect;
    private int totalIncorrect;
    private int totalSkipped;
    private double averageScore;

    public PerformanceSummary() {}

    public PerformanceSummary(double overallAccuracy, double averageResponseTimeMs, int totalQuestions,
                              int totalCorrect, int totalIncorrect, int totalSkipped, double averageScore) {
        this.overallAccuracy = overallAccuracy;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.totalQuestions = totalQuestions;
        this.totalCorrect = totalCorrect;
        this.totalIncorrect = totalIncorrect;
        this.totalSkipped = totalSkipped;
        this.averageScore = averageScore;
    }

    public double getOverallAccuracy() { return overallAccuracy; }
    public void setOverallAccuracy(double overallAccuracy) { this.overallAccuracy = overallAccuracy; }
    public double getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(double averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }
    public int getTotalCorrect() { return totalCorrect; }
    public void setTotalCorrect(int totalCorrect) { this.totalCorrect = totalCorrect; }
    public int getTotalIncorrect() { return totalIncorrect; }
    public void setTotalIncorrect(int totalIncorrect) { this.totalIncorrect = totalIncorrect; }
    public int getTotalSkipped() { return totalSkipped; }
    public void setTotalSkipped(int totalSkipped) { this.totalSkipped = totalSkipped; }
    public double getAverageScore() { return averageScore; }
    public void setAverageScore(double averageScore) { this.averageScore = averageScore; }
}
