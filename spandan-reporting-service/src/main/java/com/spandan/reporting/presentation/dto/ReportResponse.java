package com.spandan.reporting.presentation.dto;

import java.util.Map;

public class ReportResponse {

    private String sessionId;
    private String analyticsType;
    private String generatedAt;
    private String status;
    private Map<String, Object> data;

    public ReportResponse() {}

    public ReportResponse(String sessionId, String analyticsType, String generatedAt,
                          String status, Map<String, Object> data) {
        this.sessionId = sessionId;
        this.analyticsType = analyticsType;
        this.generatedAt = generatedAt;
        this.status = status;
        this.data = data;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getAnalyticsType() { return analyticsType; }
    public void setAnalyticsType(String analyticsType) { this.analyticsType = analyticsType; }
    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Map<String, Object> getData() { return data; }
    public void setData(Map<String, Object> data) { this.data = data; }
}
