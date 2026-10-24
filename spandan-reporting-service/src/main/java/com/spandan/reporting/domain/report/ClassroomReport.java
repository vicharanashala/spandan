package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.SectionPerformance;
import com.spandan.reporting.domain.report.component.TopicPerformance;

import java.util.List;

public class ClassroomReport {

    private String sessionId;
    private int totalStudents;
    private double participationRate;
    private double averageAccuracy;
    private double averageResponseTimeMs;
    private List<SectionPerformance> sectionAnalytics;
    private List<TopicPerformance> topicAnalytics;
    private List<ConceptPerformance> conceptAnalytics;
    private ConceptPerformance mostDifficultConcept;
    private String mostDifficultTopic;
    private SectionPerformance highestPerformingSection;
    private SectionPerformance lowestPerformingSection;
    private LearningProgression learningTrend;

    public ClassroomReport() {}

    public ClassroomReport(String sessionId, int totalStudents, double participationRate, double averageAccuracy,
                           double averageResponseTimeMs, List<SectionPerformance> sectionAnalytics,
                           List<TopicPerformance> topicAnalytics, List<ConceptPerformance> conceptAnalytics,
                           ConceptPerformance mostDifficultConcept, String mostDifficultTopic,
                           SectionPerformance highestPerformingSection, SectionPerformance lowestPerformingSection,
                           LearningProgression learningTrend) {
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
        this.learningTrend = learningTrend;
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
    public List<SectionPerformance> getSectionAnalytics() { return sectionAnalytics; }
    public void setSectionAnalytics(List<SectionPerformance> sectionAnalytics) { this.sectionAnalytics = sectionAnalytics; }
    public List<TopicPerformance> getTopicAnalytics() { return topicAnalytics; }
    public void setTopicAnalytics(List<TopicPerformance> topicAnalytics) { this.topicAnalytics = topicAnalytics; }
    public List<ConceptPerformance> getConceptAnalytics() { return conceptAnalytics; }
    public void setConceptAnalytics(List<ConceptPerformance> conceptAnalytics) { this.conceptAnalytics = conceptAnalytics; }
    public ConceptPerformance getMostDifficultConcept() { return mostDifficultConcept; }
    public void setMostDifficultConcept(ConceptPerformance mostDifficultConcept) { this.mostDifficultConcept = mostDifficultConcept; }
    public String getMostDifficultTopic() { return mostDifficultTopic; }
    public void setMostDifficultTopic(String mostDifficultTopic) { this.mostDifficultTopic = mostDifficultTopic; }
    public SectionPerformance getHighestPerformingSection() { return highestPerformingSection; }
    public void setHighestPerformingSection(SectionPerformance highestPerformingSection) { this.highestPerformingSection = highestPerformingSection; }
    public SectionPerformance getLowestPerformingSection() { return lowestPerformingSection; }
    public void setLowestPerformingSection(SectionPerformance lowestPerformingSection) { this.lowestPerformingSection = lowestPerformingSection; }
    public LearningProgression getLearningTrend() { return learningTrend; }
    public void setLearningTrend(LearningProgression learningTrend) { this.learningTrend = learningTrend; }
}
