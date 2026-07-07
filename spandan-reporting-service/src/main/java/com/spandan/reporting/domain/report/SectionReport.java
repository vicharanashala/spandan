package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.PerformanceSummary;

import java.util.List;

public class SectionReport {

    private String sectionId;
    private String sectionName;
    private PerformanceSummary performance;
    private List<SubsectionReport> subsections;

    public SectionReport() {}

    public SectionReport(String sectionId, String sectionName, PerformanceSummary performance,
                         List<SubsectionReport> subsections) {
        this.sectionId = sectionId;
        this.sectionName = sectionName;
        this.performance = performance;
        this.subsections = subsections;
    }

    public String getSectionId() { return sectionId; }
    public void setSectionId(String sectionId) { this.sectionId = sectionId; }
    public String getSectionName() { return sectionName; }
    public void setSectionName(String sectionName) { this.sectionName = sectionName; }
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
    public List<SubsectionReport> getSubsections() { return subsections; }
    public void setSubsections(List<SubsectionReport> subsections) { this.subsections = subsections; }
}
