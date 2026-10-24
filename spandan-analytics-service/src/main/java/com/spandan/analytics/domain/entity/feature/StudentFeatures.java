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
@Table(name = "student_features",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "student_id"}))
public class StudentFeatures {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "total_questions_displayed", nullable = false)
    private int totalQuestionsDisplayed;

    @Column(name = "total_answered", nullable = false)
    private int totalAnswered;

    @Column(name = "total_correct", nullable = false)
    private int totalCorrect;

    @Column(name = "total_incorrect", nullable = false)
    private int totalIncorrect;

    @Column(name = "total_timed_out", nullable = false)
    private int totalTimedOut;

    @Column(name = "participation_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal participationRate;

    @Column(name = "accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal accuracy;

    @Column(name = "average_response_time_ms", nullable = false)
    private long averageResponseTimeMs;

    @Column(name = "response_time_consistency", nullable = false, precision = 5, scale = 2)
    private BigDecimal responseTimeConsistency;

    @Column(name = "timeout_percentage", nullable = false, precision = 5, scale = 2)
    private BigDecimal timeoutPercentage;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public StudentFeatures() {}

    public StudentFeatures(UUID sessionId, UUID studentId, int totalQuestionsDisplayed,
                           int totalAnswered, int totalCorrect, int totalIncorrect,
                           int totalTimedOut, BigDecimal participationRate, BigDecimal accuracy,
                           long averageResponseTimeMs, BigDecimal responseTimeConsistency,
                           BigDecimal timeoutPercentage) {
        this.sessionId = sessionId;
        this.studentId = studentId;
        this.totalQuestionsDisplayed = totalQuestionsDisplayed;
        this.totalAnswered = totalAnswered;
        this.totalCorrect = totalCorrect;
        this.totalIncorrect = totalIncorrect;
        this.totalTimedOut = totalTimedOut;
        this.participationRate = participationRate;
        this.accuracy = accuracy;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.responseTimeConsistency = responseTimeConsistency;
        this.timeoutPercentage = timeoutPercentage;
        this.generatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getStudentId() { return studentId; }
    public int getTotalQuestionsDisplayed() { return totalQuestionsDisplayed; }
    public int getTotalAnswered() { return totalAnswered; }
    public int getTotalCorrect() { return totalCorrect; }
    public int getTotalIncorrect() { return totalIncorrect; }
    public int getTotalTimedOut() { return totalTimedOut; }
    public BigDecimal getParticipationRate() { return participationRate; }
    public BigDecimal getAccuracy() { return accuracy; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public BigDecimal getResponseTimeConsistency() { return responseTimeConsistency; }
    public BigDecimal getTimeoutPercentage() { return timeoutPercentage; }
    public Instant getGeneratedAt() { return generatedAt; }
}
