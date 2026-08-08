package com.spandan.reporting.domain.report.component;

public class LeaderboardPosition {

    private int rank;
    private int totalStudents;
    private double totalScore;
    private double accuracy;
    private int percentile;

    public LeaderboardPosition() {}

    public LeaderboardPosition(int rank, int totalStudents, double totalScore, double accuracy, int percentile) {
        this.rank = rank;
        this.totalStudents = totalStudents;
        this.totalScore = totalScore;
        this.accuracy = accuracy;
        this.percentile = percentile;
    }

    public int getRank() { return rank; }
    public void setRank(int rank) { this.rank = rank; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
    public double getTotalScore() { return totalScore; }
    public void setTotalScore(double totalScore) { this.totalScore = totalScore; }
    public double getAccuracy() { return accuracy; }
    public void setAccuracy(double accuracy) { this.accuracy = accuracy; }
    public int getPercentile() { return percentile; }
    public void setPercentile(int percentile) { this.percentile = percentile; }
}
