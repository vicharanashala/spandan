package com.spandan.reporting.domain.report;

import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.LeaderboardPosition;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import com.spandan.reporting.domain.report.component.SectionPerformance;
import com.spandan.reporting.domain.report.component.TopicPerformance;

import java.util.List;

public class StudentReport {

    private String studentId;
    private String sessionId;
    private PerformanceSummary performance;
    private List<SectionPerformance> sectionPerformance;
    private List<TopicPerformance> topicPerformance;
    private List<ConceptPerformance> conceptPerformance;
    private List<ConceptPerformance> weakConcepts;
    private List<ConceptPerformance> strongConcepts;
    private LearningProgression learningProgression;
    private EngagementSummary engagement;
    private LeaderboardPosition leaderboard;
    private HistoricalComparison historicalComparison;

    public static class HistoricalComparison {
        private double previousAccuracy;
        private double accuracyChange;
        private String trend;
        private int sessionsCompared;

        public HistoricalComparison() {}

        public HistoricalComparison(double previousAccuracy, double accuracyChange, String trend, int sessionsCompared) {
            this.previousAccuracy = previousAccuracy;
            this.accuracyChange = accuracyChange;
            this.trend = trend;
            this.sessionsCompared = sessionsCompared;
        }

        public double getPreviousAccuracy() { return previousAccuracy; }
        public void setPreviousAccuracy(double previousAccuracy) { this.previousAccuracy = previousAccuracy; }
        public double getAccuracyChange() { return accuracyChange; }
        public void setAccuracyChange(double accuracyChange) { this.accuracyChange = accuracyChange; }
        public String getTrend() { return trend; }
        public void setTrend(String trend) { this.trend = trend; }
        public int getSessionsCompared() { return sessionsCompared; }
        public void setSessionsCompared(int sessionsCompared) { this.sessionsCompared = sessionsCompared; }
    }

    public StudentReport() {}

    public StudentReport(String studentId, String sessionId, PerformanceSummary performance,
                         List<SectionPerformance> sectionPerformance, List<TopicPerformance> topicPerformance,
                         List<ConceptPerformance> conceptPerformance, List<ConceptPerformance> weakConcepts,
                         List<ConceptPerformance> strongConcepts, LearningProgression learningProgression,
                         EngagementSummary engagement, LeaderboardPosition leaderboard,
                         HistoricalComparison historicalComparison) {
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
    public PerformanceSummary getPerformance() { return performance; }
    public void setPerformance(PerformanceSummary performance) { this.performance = performance; }
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
    public LearningProgression getLearningProgression() { return learningProgression; }
    public void setLearningProgression(LearningProgression learningProgression) { this.learningProgression = learningProgression; }
    public EngagementSummary getEngagement() { return engagement; }
    public void setEngagement(EngagementSummary engagement) { this.engagement = engagement; }
    public LeaderboardPosition getLeaderboard() { return leaderboard; }
    public void setLeaderboard(LeaderboardPosition leaderboard) { this.leaderboard = leaderboard; }
    public HistoricalComparison getHistoricalComparison() { return historicalComparison; }
    public void setHistoricalComparison(HistoricalComparison historicalComparison) { this.historicalComparison = historicalComparison; }
}
