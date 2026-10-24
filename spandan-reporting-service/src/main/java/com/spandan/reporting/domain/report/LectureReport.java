package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
import com.spandan.reporting.domain.report.component.PerformanceSummary;

import java.util.List;

public class LectureReport {

    private String lectureId;
    private List<String> sessionIds;
    private List<String> sectionsCovered;
    private List<String> subsectionsCovered;
    private List<String> topicsCovered;
    private List<String> conceptsCovered;
    private PerformanceSummary performance;
    private ParticipationSummary participation;
    private EngagementSummary engagement;
    private int totalStudents;

    public LectureReport() {}

    public LectureReport(String lectureId, List<String> sessionIds, List<String> sectionsCovered,
                         List<String> subsectionsCovered, List<String> topicsCovered, List<String> conceptsCovered,
                         PerformanceSummary performance, ParticipationSummary participation,
                         EngagementSummary engagement, int totalStudents) {
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
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
    public ParticipationSummary getParticipation() { return participation; }
    public void setParticipation(ParticipationSummary participation) { this.participation = participation; }
    public EngagementSummary getEngagement() { return engagement; }
    public void setEngagement(EngagementSummary engagement) { this.engagement = engagement; }
    public int getTotalStudents() { return totalStudents; }
    public void setTotalStudents(int totalStudents) { this.totalStudents = totalStudents; }
}
