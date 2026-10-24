package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class LearningObjectiveMasteryResponse {

    private UUID studentId;
    private String learningObjective;
    private int questionsAttempted;
    private int questionsCorrect;
    private BigDecimal masteryPct;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public String getLearningObjective() { return learningObjective; }
    public void setLearningObjective(String learningObjective) { this.learningObjective = learningObjective; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int questionsAttempted) { this.questionsAttempted = questionsAttempted; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public void setQuestionsCorrect(int questionsCorrect) { this.questionsCorrect = questionsCorrect; }
    public BigDecimal getMasteryPct() { return masteryPct; }
    public void setMasteryPct(BigDecimal masteryPct) { this.masteryPct = masteryPct; }
}
