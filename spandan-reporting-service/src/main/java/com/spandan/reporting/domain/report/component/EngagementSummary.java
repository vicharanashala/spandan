package com.spandan.reporting.domain.report.component;

public class EngagementSummary {

    private String engagementLevel;
    private double participationRate;
    private double timeoutRate;
    private double responseTimeConsistency;
    private String responseTimeTrend;

    public EngagementSummary() {}

    public EngagementSummary(String engagementLevel, double participationRate, double timeoutRate,
                             double responseTimeConsistency, String responseTimeTrend) {
        this.engagementLevel = engagementLevel;
        this.participationRate = participationRate;
        this.timeoutRate = timeoutRate;
        this.responseTimeConsistency = responseTimeConsistency;
        this.responseTimeTrend = responseTimeTrend;
    }

    public String getEngagementLevel() { return engagementLevel; }
    public void setEngagementLevel(String engagementLevel) { this.engagementLevel = engagementLevel; }
    public double getParticipationRate() { return participationRate; }
    public void setParticipationRate(double participationRate) { this.participationRate = participationRate; }
    public double getTimeoutRate() { return timeoutRate; }
    public void setTimeoutRate(double timeoutRate) { this.timeoutRate = timeoutRate; }
    public double getResponseTimeConsistency() { return responseTimeConsistency; }
    public void setResponseTimeConsistency(double responseTimeConsistency) { this.responseTimeConsistency = responseTimeConsistency; }
    public String getResponseTimeTrend() { return responseTimeTrend; }
    public void setResponseTimeTrend(String responseTimeTrend) { this.responseTimeTrend = responseTimeTrend; }
}
