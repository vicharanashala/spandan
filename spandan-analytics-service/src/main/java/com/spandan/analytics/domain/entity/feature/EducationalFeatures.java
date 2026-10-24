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
@Table(name = "educational_features",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "student_id", "educational_level", "educational_id"}))
public class EducationalFeatures {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "educational_level", nullable = false)
    private String educationalLevel;

    @Column(name = "educational_id")
    private String educationalId;

    @Column(name = "educational_name")
    private String educationalName;

    @Column(name = "questions_attempted", nullable = false)
    private int questionsAttempted;

    @Column(name = "questions_correct", nullable = false)
    private int questionsCorrect;

    @Column(name = "accuracy", nullable = false, precision = 5, scale = 2)
    private BigDecimal accuracy;

    @Column(name = "average_response_time_ms")
    private long averageResponseTimeMs;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public EducationalFeatures() {}

    public EducationalFeatures(UUID sessionId, UUID studentId, String educationalLevel,
                               String educationalId, String educationalName, int questionsAttempted,
                               int questionsCorrect, BigDecimal accuracy, long averageResponseTimeMs) {
        this.sessionId = sessionId;
        this.studentId = studentId;
        this.educationalLevel = educationalLevel;
        this.educationalId = educationalId;
        this.educationalName = educationalName;
        this.questionsAttempted = questionsAttempted;
        this.questionsCorrect = questionsCorrect;
        this.accuracy = accuracy;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.generatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getStudentId() { return studentId; }
    public String getEducationalLevel() { return educationalLevel; }
    public String getEducationalId() { return educationalId; }
    public String getEducationalName() { return educationalName; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public BigDecimal getAccuracy() { return accuracy; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public Instant getGeneratedAt() { return generatedAt; }
}
