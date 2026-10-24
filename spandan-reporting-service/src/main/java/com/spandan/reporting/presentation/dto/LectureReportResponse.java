package com.spandan.reporting.presentation.dto;

import java.util.List;
import java.util.Map;

public class LectureReportResponse {

    private String lectureId;
    private List<String> sessionIds;
    private List<String> sectionsCovered;
    private List<String> subsectionsCovered;
    private List<String> topicsCovered;
    private List<String> conceptsCovered;
    private Map<String, Object> performance;
    private Map<String, Object> participation;
    private Map<String, Object> engagement;
    private int totalStudents;

    public LectureReportResponse() {}

    public LectureReportResponse(String lectureId, List<String> sessionIds, List<String> sectionsCovered,
                                  List<String> subsectionsCovered, List<String> topicsCovered,
                                  List<String> conceptsCovered, Map<String, Object> performance,
                                  Map<String, Object> participation, Map<String, Object> engagement,
                                  int totalStudents) {
        this.lectureId = lectureId;
        this.sessionIds = sessionIds;
        this.sectionsCovered = sectionsCovered;
        this.subsectionsCovered = subsectionsCovered;
        this.topicsCovered = topicsCovered;
        this.conceptsCovered = conceptsCovered;
        this.performance = performance;
        this.participation = participation;
        this.engagement = engagement;
        this.totalStudents = totalStudents;
    }

    public String getLectureId() { return lectureId; }
    public void setLectureId(String lectureId) { this.lectureId = lectureId; }
    public List<String> getSessionIds() { return sessionIds; }
    public void setSessionIds(List<String> sessionIds) { this.sessionIds = sessionIds; }
    public List<String> getSectionsCovered() { return sectionsCovered; }
    public void setSectionsCovered(List<String> sectionsCovered) { this.sectionsCovered = sectionsCovered; }
    public List<String> getSubsectionsCovered() { return subsectionsCovered; }
    public void setSubsectionsCovered(List<String> subsectionsCovered) { this.subsectionsCovered = subsectionsCovered; }
    public List<String> getTopicsCovered() { return topicsCovered; }
    public void setTopicsCovered(List<String> topicsCovered) { this.topicsCovered = topicsCovered; }
    public List<String> getConceptsCovered() { return conceptsCovered; }
    public void setConceptsCovered(List<String> conceptsCovered) { this.conceptsCovered = conceptsCovered; }
    public Map<String, Object> getPerformance() { return performance; }
    public void setPerformance(Map<String, Object> performance) { this.performance = performance; }
    public Map<String, Object> getParticipation() { return participation; }
    public void setParticipation(Map<String, Object> participation) { this.participation = participation; }
    public Map<String, Object> getEngagement() { return engagement; }
    public void setEngagement(Map<String, Object> engagement) { this.engagement = engagement; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
}
