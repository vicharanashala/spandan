package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class SessionReportResponse {

    private String sessionId;
    private String lectureId;
    private String teacherId;
    private Map<String, Object> participation;
    private Map<String, Object> performance;
    private Map<String, Object> engagement;
    private List<String> topicsCovered;
    private List<String> conceptsCovered;
    private List<String> sectionsCovered;
    private Map<String, Object> summary;

    public SessionReportResponse() {}

    public SessionReportResponse(String sessionId, String lectureId, String teacherId,
                                  Map<String, Object> participation, Map<String, Object> performance,
                                  Map<String, Object> engagement, List<String> topicsCovered,
                                  List<String> conceptsCovered, List<String> sectionsCovered,
                                  Map<String, Object> summary) {
        this.sessionId = sessionId;
        this.lectureId = lectureId;
        this.teacherId = teacherId;
        this.participation = participation;
        this.performance = performance;
        this.engagement = engagement;
        this.topicsCovered = topicsCovered;
        this.conceptsCovered = conceptsCovered;
        this.sectionsCovered = sectionsCovered;
        this.summary = summary;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getLectureId() { return lectureId; }
    public void setLectureId(String lectureId) { this.lectureId = lectureId; }
    public String getTeacherId() { return teacherId; }
    public void setTeacherId(String teacherId) { this.teacherId = teacherId; }
    public Map<String, Object> getParticipation() { return participation; }
    public void setParticipation(Map<String, Object> participation) { this.participation = participation; }
    public Map<String, Object> getPerformance() { return performance; }
    public void setPerformance(Map<String, Object> performance) { this.performance = performance; }
    public Map<String, Object> getEngagement() { return engagement; }
    public void setEngagement(Map<String, Object> engagement) { this.engagement = engagement; }
    public List<String> getTopicsCovered() { return topicsCovered; }
    public void setTopicsCovered(List<String> topicsCovered) { this.topicsCovered = topicsCovered; }
    public List<String> getConceptsCovered() { return conceptsCovered; }
    public void setConceptsCovered(List<String> conceptsCovered) { this.conceptsCovered = conceptsCovered; }
    public List<String> getSectionsCovered() { return sectionsCovered; }
    public void setSectionsCovered(List<String> sectionsCovered) { this.sectionsCovered = sectionsCovered; }
    public Map<String, Object> getSummary() { return summary; }
    public void setSummary(Map<String, Object> summary) { this.summary = summary; }
}
