package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class SessionFeaturesResponse {
    private UUID sessionId;
    private int questionsAttempted;
    private int questionsSkipped;
    private BigDecimal completionRate;
    private int totalStudents;
    private int totalInteractions;

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID v) { this.sessionId = v; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int v) { this.questionsAttempted = v; }
    public int getQuestionsSkipped() { return questionsSkipped; }
    public void setQuestionsSkipped(int v) { this.questionsSkipped = v; }
    public BigDecimal getCompletionRate() { return completionRate; }
    public void setCompletionRate(BigDecimal v) { this.completionRate = v; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int v) { this.totalStudents = v; }
    public int getTotalInteractions() { return totalInteractions; }
    public void setTotalInteractions(int v) { this.totalInteractions = v; }
}
