package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class StudentReportResponse {

    private String studentId;
    private String sessionId;
    private Map<String, Object> performance;
    private List<Map<String, Object>> sectionPerformance;
    private List<Map<String, Object>> topicPerformance;
    private List<Map<String, Object>> conceptPerformance;
    private List<Map<String, Object>> weakConcepts;
    private List<Map<String, Object>> strongConcepts;
    private Map<String, Object> learningProgression;
    private Map<String, Object> engagement;
    private Map<String, Object> leaderboard;
    private Map<String, Object> historicalComparison;

    public StudentReportResponse() {}

    public StudentReportResponse(String studentId, String sessionId, Map<String, Object> performance,
                                  List<Map<String, Object>> sectionPerformance,
                                  List<Map<String, Object>> topicPerformance,
                                  List<Map<String, Object>> conceptPerformance,
                                  List<Map<String, Object>> weakConcepts,
                                  List<Map<String, Object>> strongConcepts,
                                  Map<String, Object> learningProgression, Map<String, Object> engagement,
                                  Map<String, Object> leaderboard, Map<String, Object> historicalComparison) {
        this.studentId = studentId;
        this.sessionId = sessionId;
        this.performance = performance;
        this.sectionPerformance = sectionPerformance;
        this.topicPerformance = topicPerformance;
        this.conceptPerformance = conceptPerformance;
        this.weakConcepts = weakConcepts;
        this.strongConcepts = strongConcepts;
        this.learningProgression = learningProgression;
        this.engagement = engagement;
        this.leaderboard = leaderboard;
        this.historicalComparison = historicalComparison;
    }

    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Map<String, Object> getPerformance() { return performance; }
    public void setPerformance(Map<String, Object> performance) { this.performance = performance; }
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
    public Map<String, Object> getLearningProgression() { return learningProgression; }
    public void setLearningProgression(Map<String, Object> learningProgression) { this.learningProgression = learningProgression; }
    public Map<String, Object> getEngagement() { return engagement; }
    public void setEngagement(Map<String, Object> engagement) { this.engagement = engagement; }
    public Map<String, Object> getLeaderboard() { return leaderboard; }
    public void setLeaderboard(Map<String, Object> leaderboard) { this.leaderboard = leaderboard; }
    public Map<String, Object> getHistoricalComparison() { return historicalComparison; }
    public void setHistoricalComparison(Map<String, Object> historicalComparison) { this.historicalComparison = historicalComparison; }
}
