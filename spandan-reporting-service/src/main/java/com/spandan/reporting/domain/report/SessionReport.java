package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
import com.spandan.reporting.domain.report.component.PerformanceSummary;

import java.util.List;
import java.util.Map;

public class SessionReport {

    private String sessionId;
    private String lectureId;
    private String teacherId;
    private ParticipationSummary participation;
    private PerformanceSummary performance;
    private EngagementSummary engagement;
    private List<String> topicsCovered;
    private List<String> conceptsCovered;
    private List<String> sectionsCovered;
    private Map<String, Object> rawSummary;

    public SessionReport() {}

    public SessionReport(String sessionId, String lectureId, String teacherId,
                         ParticipationSummary participation, PerformanceSummary performance,
                         EngagementSummary engagement, List<String> topicsCovered,
                         List<String> conceptsCovered, List<String> sectionsCovered,
                         Map<String, Object> rawSummary) {
        this.sessionId = sessionId;
        this.lectureId = lectureId;
        this.teacherId = teacherId;
        this.participation = participation;
        this.performance = performance;
        this.engagement = engagement;
        this.topicsCovered = topicsCovered;
        this.conceptsCovered = conceptsCovered;
        this.sectionsCovered = sectionsCovered;
        this.rawSummary = rawSummary;
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getLectureId() { return lectureId; }
    public void setLectureId(String lectureId) { this.lectureId = lectureId; }
    public String getTeacherId() { return teacherId; }
    public void setTeacherId(String teacherId) { this.teacherId = teacherId; }
    public ParticipationSummary getParticipation() { return participation; }
    public void setParticipation(ParticipationSummary participation) { this.participation = participation; }
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
    public EngagementSummary getEngagement() { return engagement; }
    public void setEngagement(EngagementSummary engagement) { this.engagement = engagement; }
    public List<String> getTopicsCovered() { return topicsCovered; }
    public void setTopicsCovered(List<String> topicsCovered) { this.topicsCovered = topicsCovered; }
    public List<String> getConceptsCovered() { return conceptsCovered; }
    public void setConceptsCovered(List<String> conceptsCovered) { this.conceptsCovered = conceptsCovered; }
    public List<String> getSectionsCovered() { return sectionsCovered; }
    public void setSectionsCovered(List<String> sectionsCovered) { this.sectionsCovered = sectionsCovered; }
    public Map<String, Object> getRawSummary() { return rawSummary; }
    public void setRawSummary(Map<String, Object> rawSummary) { this.rawSummary = rawSummary; }
}
