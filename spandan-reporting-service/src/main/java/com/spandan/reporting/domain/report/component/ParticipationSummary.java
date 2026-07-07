package com.spandan.reporting.domain.report.component;

public class ParticipationSummary {

    private int totalStudents;
    private int totalAnswered;
    private int totalDisplayed;
    private double participationRate;
    private int totalTimedOut;
    private double timeoutRate;

    public ParticipationSummary() {}

    public ParticipationSummary(int totalStudents, int totalAnswered, int totalDisplayed,
                                double participationRate, int totalTimedOut, double timeoutRate) {
        this.totalStudents = totalStudents;
        this.totalAnswered = totalAnswered;
        this.totalDisplayed = totalDisplayed;
        this.participationRate = participationRate;
        this.totalTimedOut = totalTimedOut;
        this.timeoutRate = timeoutRate;
    }

    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
    public int getTotalAnswered() { return totalAnswered; }
    public void setTotalAnswered(int totalAnswered) { this.totalAnswered = totalAnswered; }
    public int getTotalDisplayed() { return totalDisplayed; }
    public void setTotalDisplayed(int totalDisplayed) { this.totalDisplayed = totalDisplayed; }
    public double getParticipationRate() { return participationRate; }
    public void setParticipationRate(double participationRate) { this.participationRate = participationRate; }
    public int getTotalTimedOut() { return totalTimedOut; }
    public void setTotalTimedOut(int totalTimedOut) { this.totalTimedOut = totalTimedOut; }
    public double getTimeoutRate() { return timeoutRate; }
    public void setTimeoutRate(double timeoutRate) { this.timeoutRate = timeoutRate; }
}
