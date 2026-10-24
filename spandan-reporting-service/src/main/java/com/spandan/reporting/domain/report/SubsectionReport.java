package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.PerformanceSummary;

public class SubsectionReport {

    private String subsectionId;
    private String subsectionName;
    private PerformanceSummary performance;

    public SubsectionReport() {}

    public SubsectionReport(String subsectionId, String subsectionName, PerformanceSummary performance) {
        this.subsectionId = subsectionId;
        this.subsectionName = subsectionName;
        this.performance = performance;
    }

    public String getSubsectionId() { return subsectionId; }
    public void setSubsectionId(String subsectionId) { this.subsectionId = subsectionId; }
    public String getSubsectionName() { return subsectionName; }
    public void setSubsectionName(String subsectionName) { this.subsectionName = subsectionName; }
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
}
