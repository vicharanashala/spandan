package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.StudentReport;
import com.spandan.reporting.domain.report.StudentReport.HistoricalComparison;
import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.LeaderboardPosition;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import com.spandan.reporting.domain.report.component.SectionPerformance;
import com.spandan.reporting.domain.report.component.TopicPerformance;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class StudentReportBuilder {

    public StudentReport build(String sessionId, String studentId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        Map<String, Object> leaderboardData = orchestrator.getReportData(sessionId, "LEADERBOARD");
        if (studentData == null) return null;

        Map<String, Object> studentEntry = findStudentEntry(studentData, studentId);
        if (studentEntry == null) return null;

        PerformanceSummary performance = extractPerformance(studentEntry);
        List<SectionPerformance> sectionPerf = extractSectionPerformance(studentEntry);
        List<TopicPerformance> topicPerf = extractTopicPerformance(studentEntry);
        List<ConceptPerformance> conceptPerf = extractConceptPerformance(studentEntry);
        List<ConceptPerformance> weakConcepts = extractWeakConcepts(conceptPerf);
        List<ConceptPerformance> strongConcepts = extractStrongConcepts(conceptPerf);
        LearningProgression progression = extractLearningProgression(studentEntry);
        EngagementSummary engagement = extractEngagement(studentEntry);
        LeaderboardPosition leaderboard = extractLeaderboard(leaderboardData, studentId);
        HistoricalComparison historical = extractHistoricalComparison(studentEntry);

        return new StudentReport(studentId, sessionId, performance, sectionPerf, topicPerf,
                conceptPerf, weakConcepts, strongConcepts, progression, engagement,
                leaderboard, historical);
    }

    @SuppressWarnings("unchecked")
    public List<StudentReport> buildAll(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return List.of();

        List<Map<String, Object>> students = (List<Map<String, Object>>) studentData.get("students");
        if (students == null) return List.of();

        return students.stream()
                .map(entry -> build(sessionId, (String) entry.get("studentId"), orchestrator))
                .filter(r -> r != null)
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findStudentEntry(Map<String, Object> studentData, String studentId) {
        List<Map<String, Object>> students = (List<Map<String, Object>>) studentData.get("students");
        if (students == null) return null;
        return students.stream()
                .filter(s -> studentId.equals(s.get("studentId")))
                .findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private PerformanceSummary extractPerformance(Map<String, Object> entry) {
        return new PerformanceSummary(
                toDouble(entry.get("accuracy")), toDouble(entry.get("averageResponseTimeMs")),
                toInt(entry.get("totalAnswered")), toInt(entry.get("totalCorrect")),
                toInt(entry.get("totalIncorrect")), toInt(entry.get("totalSkipped")),
                toDouble(entry.get("totalScore")));
    }

    @SuppressWarnings("unchecked")
    private List<SectionPerformance> extractSectionPerformance(Map<String, Object> entry) {
        List<Map<String, Object>> sections = (List<Map<String, Object>>) entry.get("sectionPerformance");
        if (sections == null) return List.of();
        return sections.stream().map(s -> new SectionPerformance(
                (String) s.get("sectionId"), (String) s.get("sectionName"),
                toDouble(s.get("accuracy")), toInt(s.get("questionsAttempted")),
                toInt(s.get("questionsCorrect")), toDouble(s.get("averageResponseTimeMs")), 1
        )).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<TopicPerformance> extractTopicPerformance(Map<String, Object> entry) {
        List<Map<String, Object>> topics = (List<Map<String, Object>>) entry.get("topicPerformance");
        if (topics == null) return List.of();
        return topics.stream().map(t -> new TopicPerformance(
                (String) t.get("topicId"), (String) t.get("topicName"),
                toDouble(t.get("accuracy")), toInt(t.get("questionsAttempted")),
                toInt(t.get("questionsCorrect")), toDouble(t.get("averageResponseTimeMs"))
        )).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<ConceptPerformance> extractConceptPerformance(Map<String, Object> entry) {
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) entry.get("conceptPerformance");
        if (concepts == null) return List.of();
        return concepts.stream().map(c -> new ConceptPerformance(
                (String) c.get("conceptId"), (String) c.get("conceptName"),
                toDouble(c.get("accuracy")), toInt(c.get("questionsAttempted")),
                toInt(c.get("questionsCorrect")), toDouble(c.get("averageResponseTimeMs")),
                (String) c.get("trend")
        )).collect(Collectors.toList());
    }

    private List<ConceptPerformance> extractWeakConcepts(List<ConceptPerformance> concepts) {
        return concepts.stream()
                .sorted(Comparator.comparingDouble(ConceptPerformance::getAccuracy))
                .limit(5)
                .collect(Collectors.toList());
    }

    private List<ConceptPerformance> extractStrongConcepts(List<ConceptPerformance> concepts) {
        return concepts.stream()
                .sorted(Comparator.comparingDouble(ConceptPerformance::getAccuracy).reversed())
                .limit(5)
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private LearningProgression extractLearningProgression(Map<String, Object> entry) {
        List<Double> progression = (List<Double>) entry.get("learningProgression");
        if (progression == null || progression.isEmpty()) {
            return new LearningProgression(List.of(), List.of(), "UNKNOWN", 0);
        }
        double first = progression.get(0);
        double last = progression.get(progression.size() - 1);
        String trend = last > first ? "IMPROVING" : last < first ? "DECLINING" : "STABLE";
        double rate = first > 0 ? ((last - first) / first) * 100 : 0;
        return new LearningProgression(progression, List.of(), trend, rate);
    }

    @SuppressWarnings("unchecked")
    private EngagementSummary extractEngagement(Map<String, Object> entry) {
        Map<String, Object> eng = (Map<String, Object>) entry.get("engagement");
        if (eng == null) {
            return new EngagementSummary("UNKNOWN", toDouble(entry.get("participationRate")),
                    0, 0, "UNKNOWN");
        }
        return new EngagementSummary(
                (String) eng.get("engagementLevel"), toDouble(eng.get("participationRate")),
                toDouble(eng.get("timeoutRate")), toDouble(eng.get("responseTimeConsistency")),
                (String) eng.get("responseTimeTrend"));
    }

    @SuppressWarnings("unchecked")
    private LeaderboardPosition extractLeaderboard(Map<String, Object> leaderboardData, String studentId) {
        if (leaderboardData == null) return null;
        List<Map<String, Object>> entries = (List<Map<String, Object>>) leaderboardData.get("entries");
        if (entries == null) return null;
        return entries.stream()
                .filter(e -> studentId.equals(e.get("studentId")))
                .findFirst()
                .map(e -> new LeaderboardPosition(
                        toInt(e.get("rank")), entries.size(),
                        toDouble(e.get("totalScore")), toDouble(e.get("accuracy")),
                        entries.size() > 0 ? (int) ((1.0 - (double) toInt(e.get("rank")) / entries.size()) * 100) : 0
                )).orElse(null);
    }

    @SuppressWarnings("unchecked")
    private HistoricalComparison extractHistoricalComparison(Map<String, Object> entry) {
        Map<String, Object> hist = (Map<String, Object>) entry.get("historicalComparison");
        if (hist == null) return null;
        return new HistoricalComparison(
                toDouble(hist.get("previousAccuracy")), toDouble(hist.get("accuracyChange")),
                (String) hist.get("trend"), toInt(hist.get("sessionsCompared")));
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
