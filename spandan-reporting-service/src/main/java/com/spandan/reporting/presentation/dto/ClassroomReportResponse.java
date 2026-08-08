package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class ClassroomReportResponse {

    private String sessionId;
    private int totalStudents;
    private double participationRate;
    private double averageAccuracy;
    private double averageResponseTimeMs;
    private List<Map<String, Object>> sectionAnalytics;
    private List<Map<String, Object>> topicAnalytics;
    private List<Map<String, Object>> conceptAnalytics;
    private Map<String, Object> mostDifficultConcept;
    private String mostDifficultTopic;
    private Map<String, Object> highestPerformingSection;
    private Map<String, Object> lowestPerformingSection;

    public ClassroomReportResponse() {}

    public ClassroomReportResponse(String sessionId, int totalStudents, double participationRate,
                                    double averageAccuracy, double averageResponseTimeMs,
                                    List<Map<String, Object>> sectionAnalytics,
                                    List<Map<String, Object>> topicAnalytics,
                                    List<Map<String, Object>> conceptAnalytics,
                                    Map<String, Object> mostDifficultConcept, String mostDifficultTopic,
                                    Map<String, Object> highestPerformingSection,
                                    Map<String, Object> lowestPerformingSection) {
        this.sessionId = sessionId;
        this.totalStudents = totalStudents;
        this.participationRate = participationRate;
        this.averageAccuracy = averageAccuracy;
        this.averageResponseTimeMs = averageResponseTimeMs;
        this.sectionAnalytics = sectionAnalytics;
        this.topicAnalytics = topicAnalytics;
        this.conceptAnalytics = conceptAnalytics;
        this.mostDifficultConcept = mostDifficultConcept;
        this.mostDifficultTopic = mostDifficultTopic;
        this.highestPerformingSection = highestPerformingSection;
        this.lowestPerformingSection = lowestPerformingSection;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
    public double getParticipationRate() { return participationRate; }
    public void setParticipationRate(double participationRate) { this.participationRate = participationRate; }
    public double getAverageAccuracy() { return averageAccuracy; }
    public void setAverageAccuracy(double averageAccuracy) { this.averageAccuracy = averageAccuracy; }
    public double getAverageResponseTimeMs() { return averageResponseTimeMs; }
    public void setAverageResponseTimeMs(double averageResponseTimeMs) { this.averageResponseTimeMs = averageResponseTimeMs; }
    public List<Map<String, Object>> getSectionAnalytics() { return sectionAnalytics; }
    public void setSectionAnalytics(List<Map<String, Object>> sectionAnalytics) { this.sectionAnalytics = sectionAnalytics; }
    public List<Map<String, Object>> getTopicAnalytics() { return topicAnalytics; }
    public void setTopicAnalytics(List<Map<String, Object>> topicAnalytics) { this.topicAnalytics = topicAnalytics; }
    public List<Map<String, Object>> getConceptAnalytics() { return conceptAnalytics; }
    public void setConceptAnalytics(List<Map<String, Object>> conceptAnalytics) { this.conceptAnalytics = conceptAnalytics; }
    public Map<String, Object> getMostDifficultConcept() { return mostDifficultConcept; }
    public void setMostDifficultConcept(Map<String, Object> mostDifficultConcept) { this.mostDifficultConcept = mostDifficultConcept; }
    public String getMostDifficultTopic() { return mostDifficultTopic; }
    public void setMostDifficultTopic(String mostDifficultTopic) { this.mostDifficultTopic = mostDifficultTopic; }
    public Map<String, Object> getHighestPerformingSection() { return highestPerformingSection; }
    public void setHighestPerformingSection(Map<String, Object> highestPerformingSection) { this.highestPerformingSection = highestPerformingSection; }
    public Map<String, Object> getLowestPerformingSection() { return lowestPerformingSection; }
    public void setLowestPerformingSection(Map<String, Object> lowestPerformingSection) { this.lowestPerformingSection = lowestPerformingSection; }
}
