package com.spandan.reporting.presentation.dto;

public class ReportMetadataResponse {

    private String sessionId;
    private String analyticsType;
    private String status;
    private String generatedAt;
    private int version;
    private long size;
    private String updatedAt;

    public ReportMetadataResponse() {}

    public ReportMetadataResponse(String sessionId, String analyticsType, String status,
                                  String generatedAt, int version, long size, String updatedAt) {
        this.sessionId = sessionId;
        this.analyticsType = analyticsType;
        this.status = status;
        this.generatedAt = generatedAt;
        this.version = version;
        this.size = size;
        this.updatedAt = updatedAt;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getAnalyticsType() { return analyticsType; }
    public void setAnalyticsType(String analyticsType) { this.analyticsType = analyticsType; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }
    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
