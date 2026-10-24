package com.spandan.analytics.domain.entity.historical;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "historical_student_performance",
       uniqueConstraints = @UniqueConstraint(columnNames = {"student_id"}))
public class HistoricalStudentPerformance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false, unique = true)
    private UUID studentId;

    @Column(name = "total_sessions", nullable = false)
    private int totalSessions;

    @Column(name = "average_accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal averageAccuracy;

    @Column(name = "average_participation_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal averageParticipationRate;

    @Column(name = "accuracy_trend", nullable = false)
    private String accuracyTrend;

    @Column(name = "participation_trend", nullable = false)
    private String participationTrend;

    @Column(name = "average_response_time_ms", nullable = false)
    private long averageResponseTimeMs;

    @Column(name = "last_session_accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal lastSessionAccuracy;

    @Column(name = "last_session_response_time_ms", nullable = false)
    private long lastSessionResponseTimeMs;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public HistoricalStudentPerformance() {}

    public HistoricalStudentPerformance(UUID studentId, int totalSessions, BigDecimal averageAccuracy,
                                         BigDecimal averageParticipationRate, String accuracyTrend,
                                         String participationTrend, long averageResponseTimeMs,
                                         BigDecimal lastSessionAccuracy, long lastSessionResponseTimeMs) {
        this.studentId = studentId;
        this.totalSessions = totalSessions;
        this.averageAccuracy = averageAccuracy;
        this.averageParticipationRate = averageParticipationRate;
        this.accuracyTrend = accuracyTrend;
        this.participationTrend = participationTrend;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.lastSessionAccuracy = lastSessionAccuracy;
        this.lastSessionResponseTimeMs = lastSessionResponseTimeMs;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getStudentId() { return studentId; }
    public int getTotalSessions() { return totalSessions; }
    public BigDecimal getAverageAccuracy() { return averageAccuracy; }
    public BigDecimal getAverageParticipationRate() { return averageParticipationRate; }
    public String getAccuracyTrend() { return accuracyTrend; }
    public String getParticipationTrend() { return participationTrend; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public BigDecimal getLastSessionAccuracy() { return lastSessionAccuracy; }
    public long getLastSessionResponseTimeMs() { return lastSessionResponseTimeMs; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setTotalSessions(int totalSessions) { this.totalSessions = totalSessions; }
    public void setAverageAccuracy(BigDecimal averageAccuracy) { this.averageAccuracy = averageAccuracy; }
    public void setAverageParticipationRate(BigDecimal averageParticipationRate) { this.averageParticipationRate = averageParticipationRate; }
    public void setAccuracyTrend(String accuracyTrend) { this.accuracyTrend = accuracyTrend; }
    public void setParticipationTrend(String participationTrend) { this.participationTrend = participationTrend; }
    public void setAverageResponseTimeMs(long averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
    public void setLastSessionAccuracy(BigDecimal lastSessionAccuracy) { this.lastSessionAccuracy = lastSessionAccuracy; }
    public void setLastSessionResponseTimeMs(long lastSessionResponseTimeMs) { this.lastSessionResponseTimeMs = lastSessionResponseTimeMs; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
