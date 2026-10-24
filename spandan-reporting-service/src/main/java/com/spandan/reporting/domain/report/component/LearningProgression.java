package com.spandan.reporting.domain.report.component;

import java.util.List;

public class LearningProgression {

    private List<Double> accuracyProgression;
    private List<Double> responseTimeProgression;
    private String trend;
    private double improvementRate;

    public LearningProgression() {}

    public LearningProgression(List<Double> accuracyProgression, List<Double> responseTimeProgression,
                               String trend, double improvementRate) {
        this.accuracyProgression = accuracyProgression;
        this.responseTimeProgression = responseTimeProgression;
        this.trend = trend;
        this.improvementRate = improvementRate;
    }

    public List<Double> getAccuracyProgression() { return accuracyProgression; }
    public void setAccuracyProgression(List<Double> accuracyProgression) { this.accuracyProgression = accuracyProgression; }
    public List<Double> getResponseTimeProgression() { return responseTimeProgression; }
    public void setResponseTimeProgression(List<Double> responseTimeProgression) { this.responseTimeProgression = responseTimeProgression; }
    public String getTrend() { return trend; }
    public void setTrend(String trend) { this.trend = trend; }
    public double getImprovementRate() { return improvementRate; }
    public void setImprovementRate(double improvementRate) { this.improvementRate = improvementRate; }
}
