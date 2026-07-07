package com.spandan.analytics.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "engagement_metrics",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "student_id"}))
public class EngagementMetrics {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "response_time_trend", nullable = false)
    private String responseTimeTrend;

    @Column(name = "timeout_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal timeoutRate;

    @Column(name = "participation_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal participationRate;

    @Column(name = "engagement_level", nullable = false)
    private String engagementLevel;

    @Column(name = "total_answered")
    private int totalAnswered;

    @Column(name = "total_displayed")
    private int totalDisplayed;

    public EngagementMetrics() {}

    public EngagementMetrics(UUID sessionId, UUID studentId, String responseTimeTrend,
                             BigDecimal timeoutRate, BigDecimal participationRate,
                             String engagementLevel, int totalAnswered, int totalDisplayed) {
        this.sessionId = sessionId;
        this.studentId = studentId;
        this.responseTimeTrend = responseTimeTrend;
        this.timeoutRate = timeoutRate;
        this.participationRate = participationRate;
        this.engagementLevel = engagementLevel;
        this.totalAnswered = totalAnswered;
        this.totalDisplayed = totalDisplayed;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getStudentId() { return studentId; }
    public String getResponseTimeTrend() { return responseTimeTrend; }
    public BigDecimal getTimeoutRate() { return timeoutRate; }
    public BigDecimal getParticipationRate() { return participationRate; }
    public String getEngagementLevel() { return engagementLevel; }
    public int getTotalAnswered() { return totalAnswered; }
    public int getTotalDisplayed() { return totalDisplayed; }
}
