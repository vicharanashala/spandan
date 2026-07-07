package com.spandan.analytics.domain.entity.feature;

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
@Table(name = "session_features",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id"}))
public class SessionFeatures {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "questions_attempted", nullable = false)
    private int questionsAttempted;

    @Column(name = "questions_skipped", nullable = false)
    private int questionsSkipped;

    @Column(name = "completion_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal completionRate;

    @Column(name = "total_students", nullable = false)
    private int totalStudents;

    @Column(name = "total_interactions", nullable = false)
    private int totalInteractions;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public SessionFeatures() {}

    public SessionFeatures(UUID sessionId, int questionsAttempted, int questionsSkipped,
                           BigDecimal completionRate, int totalStudents, int totalInteractions) {
        this.sessionId = sessionId;
        this.questionsAttempted = questionsAttempted;
        this.questionsSkipped = questionsSkipped;
        this.completionRate = completionRate;
        this.totalStudents = totalStudents;
        this.totalInteractions = totalInteractions;
        this.generatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public int getQuestionsSkipped() { return questionsSkipped; }
    public BigDecimal getCompletionRate() { return completionRate; }
    public int getTotalStudents() { return totalStudents; }
    public int getTotalInteractions() { return totalInteractions; }
    public Instant getGeneratedAt() { return generatedAt; }
}
