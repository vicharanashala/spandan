package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class SectionReportResponse {

    private String sectionId;
    private String sectionName;
    private Map<String, Object> performance;
    private List<Map<String, Object>> subsections;

    public SectionReportResponse() {}

    public SectionReportResponse(String sectionId, String sectionName, Map<String, Object> performance,
                                  List<Map<String, Object>> subsections) {
        this.sectionId = sectionId;
        this.sectionName = sectionName;
        this.performance = performance;
        this.subsections = subsections;
    }

    public String getSectionId() { return sectionId; }
    public void setSectionId(String sectionId) { this.sectionId = sectionId; }
    public String getSectionName() { return sectionName; }
    public void setSectionName(String sectionName) { this.sectionName = sectionName; }
    public Map<String, Object> getPerformance() { return performance; }
    public void setPerformance(Map<String, Object> performance) { this.performance = performance; }
    public List<Map<String, Object>> getSubsections() { return subsections; }
    public void setSubsections(List<Map<String, Object>> subsections) { this.subsections = subsections; }
}
