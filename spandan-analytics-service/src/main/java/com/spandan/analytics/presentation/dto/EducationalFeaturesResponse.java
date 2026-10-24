package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class EducationalFeaturesResponse {
    private UUID studentId;
    private String educationalLevel;
    private String educationalId;
    private String educationalName;
    private int questionsAttempted;
    private int questionsCorrect;
    private BigDecimal accuracy;
    private long averageResponseTimeMs;

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID v) { this.studentId = v; }
    public String getEducationalLevel() { return educationalLevel; }
    public void setEducationalLevel(String v) { this.educationalLevel = v; }
    public String getEducationalId() { return educationalId; }
    public void setEducationalId(String v) { this.educationalId = v; }
    public String getEducationalName() { return educationalName; }
    public void setEducationalName(String v) { this.educationalName = v; }
    public int getQuestionsAttempted() { return questionsAttempted; }
    public void setQuestionsAttempted(int v) { this.questionsAttempted = v; }
    public int getQuestionsCorrect() { return questionsCorrect; }
    public void setQuestionsCorrect(int v) { this.questionsCorrect = v; }
    public BigDecimal getAccuracy() { return accuracy; }
    public void setAccuracy(BigDecimal v) { this.accuracy = v; }
    public long getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(long v) { this.averageResponseTimeMs = v; }
}
