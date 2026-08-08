package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class TeacherReportResponse {

    private String sessionId;
    private int totalStudents;
    private Map<String, Object> classParticipation;
    private Map<String, Object> classPerformance;
    private List<Map<String, Object>> sectionPerformance;
    private List<Map<String, Object>> topicPerformance;
    private List<Map<String, Object>> conceptPerformance;
    private List<Map<String, Object>> weakConcepts;
    private List<Map<String, Object>> strongConcepts;
    private Map<String, Object> learningTrend;
    private List<Map<String, Object>> studentsRequiringAttention;

    public TeacherReportResponse() {}

    public TeacherReportResponse(String sessionId, int totalStudents,
                                  Map<String, Object> classParticipation,
                                  Map<String, Object> classPerformance,
                                  List<Map<String, Object>> sectionPerformance,
                                  List<Map<String, Object>> topicPerformance,
                                  List<Map<String, Object>> conceptPerformance,
                                  List<Map<String, Object>> weakConcepts,
                                  List<Map<String, Object>> strongConcepts,
                                  Map<String, Object> learningTrend,
                                  List<Map<String, Object>> studentsRequiringAttention) {
        this.sessionId = sessionId;
        this.totalStudents = totalStudents;
        this.classParticipation = classParticipation;
        this.classPerformance = classPerformance;
        this.sectionPerformance = sectionPerformance;
        this.topicPerformance = topicPerformance;
        this.conceptPerformance = conceptPerformance;
        this.weakConcepts = weakConcepts;
        this.strongConcepts = strongConcepts;
        this.learningTrend = learningTrend;
        this.studentsRequiringAttention = studentsRequiringAttention;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
    public Map<String, Object> getClassParticipation() { return classParticipation; }
    public void setClassParticipation(Map<String, Object> classParticipation) { this.classParticipation = classParticipation; }
    public Map<String, Object> getClassPerformance() { return classPerformance; }
    public void setClassPerformance(Map<String, Object> classPerformance) { this.classPerformance = classPerformance; }
    public List<Map<String, Object>> getSectionPerformance() { return sectionPerformance; }
    public void setSectionPerformance(List<Map<String, Object>> sectionPerformance) { this.sectionPerformance = sectionPerformance; }
    public List<Map<String, Object>> getTopicPerformance() { return topicPerformance; }
    public void setTopicPerformance(List<Map<String, Object>> topicPerformance) { this.topicPerformance = topicPerformance; }
    public List<Map<String, Object>> getConceptPerformance() { return conceptPerformance; }
    public void setConceptPerformance(List<Map<String, Object>> conceptPerformance) { this.conceptPerformance = conceptPerformance; }
    public List<Map<String, Object>> getWeakConcepts() { return weakConcepts; }
    public void setWeakConcepts(List<Map<String, Object>> weakConcepts) { this.weakConcepts = weakConcepts; }
    public List<Map<String, Object>> getStrongConcepts() { return strongConcepts; }
    public void setStrongConcepts(List<Map<String, Object>> strongConcepts) { this.strongConcepts = strongConcepts; }
    public Map<String, Object> getLearningTrend() { return learningTrend; }
    public void setLearningTrend(Map<String, Object> learningTrend) { this.learningTrend = learningTrend; }
    public List<Map<String, Object>> getStudentsRequiringAttention() { return studentsRequiringAttention; }
    public void setStudentsRequiringAttention(List<Map<String, Object>> studentsRequiringAttention) { this.studentsRequiringAttention = studentsRequiringAttention; }
}
