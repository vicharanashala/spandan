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
@Table(name = "learning_objective_mastery",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "student_id", "learning_objective"}))
public class LearningObjectiveMastery {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "learning_objective", nullable = false)
    private String learningObjective;

    @Column(name = "questions_attempted", nullable = false)
    private int questionsAttempted;

    @Column(name = "questions_correct", nullable = false)
    private int questionsCorrect;

    @Column(name = "mastery_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal masteryPct;

    public LearningObjectiveMastery() {}

    public LearningObjectiveMastery(UUID sessionId, UUID studentId, String learningObjective,
                                    int questionsAttempted, int questionsCorrect, BigDecimal masteryPct) {
        this.sessionId = sessionId;
        this.studentId = studentId;
        this.learningObjective = learningObjective;
        this.questionsAttempted = questionsAttempted;
        this.questionsCorrect = questionsCorrect;
        this.masteryPct = masteryPct;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getStudentId() { return studentId; }
    public String getLearningObjective() { return learningObjective; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public BigDecimal getMasteryPct() { return masteryPct; }
}
