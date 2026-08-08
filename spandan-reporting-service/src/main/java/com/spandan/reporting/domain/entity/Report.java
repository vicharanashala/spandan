package com.spandan.reporting.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reports", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"session_id", "analytics_type"})
})
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "teacher_id")
    private UUID teacherId;

    @Column(name = "analytics_type", nullable = false)
    private String analyticsType;

    @Lob
    @Column(name = "report_data", columnDefinition = "jsonb")
    private String reportData;

    @Lob
    @Column(name = "summary", columnDefinition = "jsonb")
    private String summary;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "version", nullable = false)
    private int version;

    @Column(name = "size")
    private long size;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Report() {}

    public Report(UUID sessionId, UUID teacherId, String analyticsType, String reportData,
                  String summary, Instant generatedAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.analyticsType = analyticsType;
        this.reportData = reportData;
        this.summary = summary;
        this.generatedAt = generatedAt;
        this.status = "PENDING";
        this.version = 1;
        this.size = reportData != null ? reportData.length() : 0;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getTeacherId() { return teacherId; }
    public void setTeacherId(UUID teacherId) { this.teacherId = teacherId; }
    public String getAnalyticsType() { return analyticsType; }
    public void setAnalyticsType(String analyticsType) { this.analyticsType = analyticsType; }
    public String getReportData() { return reportData; }
    public void setReportData(String reportData) { this.reportData = reportData; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
    public long getSize() { return size; }
    public void setSize(long size) { this.size = size; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public void incrementVersion() {
        this.version++;
        this.updatedAt = Instant.now();
    }
}
