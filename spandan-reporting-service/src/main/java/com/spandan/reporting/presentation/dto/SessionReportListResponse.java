package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class SessionReportListResponse {

    private List<Map<String, Object>> reports;
    private int total;

    public SessionReportListResponse() {}

    public SessionReportListResponse(List<Map<String, Object>> reports) {
        this.reports = reports;
        this.total = reports.size();
    }

    public List<Map<String, Object>> getReports() { return reports; }
    public void setReports(List<Map<String, Object>> reports) { this.reports = reports; this.total = reports.size(); }
    public int getTotal() { return total; }
}
