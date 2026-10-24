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
@Table(name = "historical_concept_performance",
       uniqueConstraints = @UniqueConstraint(columnNames = {"student_id", "concept_id"}))
public class HistoricalConceptPerformance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "concept_id", nullable = false)
    private String conceptId;

    @Column(name = "concept_name")
    private String conceptName;

    @Column(name = "total_attempts", nullable = false)
    private int totalAttempts;

    @Column(name = "total_correct", nullable = false)
    private int totalCorrect;

    @Column(name = "mastery_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal masteryPct;

    @Column(name = "sessions_covered", nullable = false)
    private int sessionsCovered;

    @Column(name = "last_accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal lastAccuracy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public HistoricalConceptPerformance() {}

    public HistoricalConceptPerformance(UUID studentId, String conceptId, String conceptName,
                                         int totalAttempts, int totalCorrect, BigDecimal masteryPct,
                                         int sessionsCovered, BigDecimal lastAccuracy) {
        this.studentId = studentId;
        this.conceptId = conceptId;
        this.conceptName = conceptName;
        this.totalAttempts = totalAttempts;
        this.totalCorrect = totalCorrect;
        this.masteryPct = masteryPct;
        this.sessionsCovered = sessionsCovered;
        this.lastAccuracy = lastAccuracy;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getStudentId() { return studentId; }
    public String getConceptId() { return conceptId; }
    public String getConceptName() { return conceptName; }
    public int getTotalAttempts() { return totalAttempts; }
    public int getTotalCorrect() { return totalCorrect; }
    public BigDecimal getMasteryPct() { return masteryPct; }
    public int getSessionsCovered() { return sessionsCovered; }
    public BigDecimal getLastAccuracy() { return lastAccuracy; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setTotalAttempts(int totalAttempts) { this.totalAttempts = totalAttempts; }
    public void setTotalCorrect(int totalCorrect) { this.totalCorrect = totalCorrect; }
    public void setMasteryPct(BigDecimal masteryPct) { this.masteryPct = masteryPct; }
    public void setSessionsCovered(int sessionsCovered) { this.sessionsCovered = sessionsCovered; }
    public void setLastAccuracy(BigDecimal lastAccuracy) { this.lastAccuracy = lastAccuracy; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
