package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import com.spandan.reporting.domain.report.component.SectionPerformance;
import com.spandan.reporting.domain.report.component.TopicPerformance;

import java.util.List;

public class TeacherReport {

    private String sessionId;
    private int totalStudents;
    private ParticipationSummary classParticipation;
    private PerformanceSummary classPerformance;
    private List<SectionPerformance> sectionPerformance;
    private List<TopicPerformance> topicPerformance;
    private List<ConceptPerformance> conceptPerformance;
    private List<ConceptPerformance> weakConcepts;
    private List<ConceptPerformance> strongConcepts;
    private LearningProgression learningTrend;
    private List<StudentAttention> studentsRequiringAttention;

    public static class StudentAttention {
        private String studentId;
        private String reason;
        private double accuracy;
        private double participationRate;
        private double timeoutRate;
        private String engagementLevel;

        public StudentAttention() {}

        public StudentAttention(String studentId, String reason, double accuracy, double participationRate,
                                double timeoutRate, String engagementLevel) {
            this.studentId = studentId;
            this.reason = reason;
            this.accuracy = accuracy;
            this.participationRate = participationRate;
            this.timeoutRate = timeoutRate;
            this.engagementLevel = engagementLevel;
        }

        public String getStudentId() { return studentId; }
        public void setStudentId(String studentId) { this.studentId = studentId; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
        public double getAccuracy() { return accuracy; }
        public void setAccuracy(double accuracy) { this.accuracy = accuracy; }
        public double getParticipationRate() { return participationRate; }
        public void setParticipationRate(double participationRate) { this.participationRate = participationRate; }
        public double getTimeoutRate() { return timeoutRate; }
        public void setTimeoutRate(double timeoutRate) { this.timeoutRate = timeoutRate; }
        public String getEngagementLevel() { return engagementLevel; }
        public void setEngagementLevel(String engagementLevel) { this.engagementLevel = engagementLevel; }
    }

    public TeacherReport() {}

    public TeacherReport(String sessionId, int totalStudents, ParticipationSummary classParticipation,
                         PerformanceSummary classPerformance, List<SectionPerformance> sectionPerformance,
                         List<TopicPerformance> topicPerformance, List<ConceptPerformance> conceptPerformance,
                         List<ConceptPerformance> weakConcepts, List<ConceptPerformance> strongConcepts,
                         LearningProgression learningTrend, List<StudentAttention> studentsRequiringAttention) {
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
    public ParticipationSummary getClassParticipation() { return classParticipation; }
    public void setClassParticipation(ParticipationSummary classParticipation) { this.classParticipation = classParticipation; }
    public PerformanceSummary getClassPerformance() { return classPerformance; }
    public void setClassPerformance(PerformanceSummary classPerformance) { this.classPerformance = classPerformance; }
    public List<SectionPerformance> getSectionPerformance() { return sectionPerformance; }
    public void setSectionPerformance(List<SectionPerformance> sectionPerformance) { this.sectionPerformance = sectionPerformance; }
    public List<TopicPerformance> getTopicPerformance() { return topicPerformance; }
    public void setTopicPerformance(List<TopicPerformance> topicPerformance) { this.topicPerformance = topicPerformance; }
    public List<ConceptPerformance> getConceptPerformance() { return conceptPerformance; }
    public void setConceptPerformance(List<ConceptPerformance> conceptPerformance) { this.conceptPerformance = conceptPerformance; }
    public List<ConceptPerformance> getWeakConcepts() { return weakConcepts; }
    public void setWeakConcepts(List<ConceptPerformance> weakConcepts) { this.weakConcepts = weakConcepts; }
    public List<ConceptPerformance> getStrongConcepts() { return strongConcepts; }
    public void setStrongConcepts(List<ConceptPerformance> strongConcepts) { this.strongConcepts = strongConcepts; }
    public LearningProgression getLearningTrend() { return learningTrend; }
    public void setLearningTrend(LearningProgression learningTrend) { this.learningTrend = learningTrend; }
    public List<StudentAttention> getStudentsRequiringAttention() { return studentsRequiringAttention; }
    public void setStudentsRequiringAttention(List<StudentAttention> studentsRequiringAttention) { this.studentsRequiringAttention = studentsRequiringAttention; }
}
