package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class ClassroomAnalyticsResponse {
    private UUID sessionId;
    private BigDecimal classAccuracy;
    private BigDecimal participationRate;
    private BigDecimal averageResponseTimeSeconds;
    private int totalStudents;
    private int totalQuestions;
    private List<Map.Entry<String, BigDecimal>> difficultConcepts;
    private List<Map.Entry<String, BigDecimal>> easyConcepts;
    private List<UUID> studentsRequiringAttention;

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID v) { this.sessionId = v; }
    public BigDecimal getClassAccuracy() { return classAccuracy; }
    public void setClassAccuracy(BigDecimal v) { this.classAccuracy = v; }
    public BigDecimal getParticipationRate() { return participationRate; }
    public void setParticipationRate(BigDecimal v) { this.participationRate = v; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public void setAverageResponseTimeSeconds(BigDecimal v) { this.averageResponseTimeSeconds = v; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int v) { this.totalStudents = v; }
    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int v) { this.totalQuestions = v; }
    public List<Map.Entry<String, BigDecimal>> getDifficultConcepts() { return difficultConcepts; }
    public void setDifficultConcepts(List<Map.Entry<String, BigDecimal>> v) { this.difficultConcepts = v; }
    public List<Map.Entry<String, BigDecimal>> getEasyConcepts() { return easyConcepts; }
    public void setEasyConcepts(List<Map.Entry<String, BigDecimal>> v) { this.easyConcepts = v; }
    public List<UUID> getStudentsRequiringAttention() { return studentsRequiringAttention; }
    public void setStudentsRequiringAttention(List<UUID> v) { this.studentsRequiringAttention = v; }
}
