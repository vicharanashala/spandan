package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.ClassroomReport;
import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.SectionPerformance;
import com.spandan.reporting.domain.report.component.TopicPerformance;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class ClassroomReportBuilder {

    public ClassroomReport build(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> sessionData = orchestrator.getReportData(sessionId, "SESSION");
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (sessionData == null) return null;

        Map<String, Object> summary = extractSummary(sessionData);
        int totalStudents = toInt(summary.get("totalStudents"));
        double participationRate = totalStudents > 0
                ? (double) toInt(summary.get("totalAnswered")) / (toInt(summary.get("totalQuestions")) * totalStudents)
                : 0;
        double avgAccuracy = toDouble(summary.get("overallAccuracy"));
        double avgRt = toDouble(summary.get("averageResponseTimeMs"));

        List<SectionPerformance> sectionAnalytics = extractSectionPerformance(studentData);
        List<TopicPerformance> topicAnalytics = extractTopicPerformance(studentData);
        List<ConceptPerformance> conceptAnalytics = extractConceptPerformance(studentData);

        ConceptPerformance mostDifficult = conceptAnalytics.stream()
                .min(Comparator.comparingDouble(ConceptPerformance::getAccuracy)).orElse(null);
        String mostDifficultTopic = topicAnalytics.stream()
                .min(Comparator.comparingDouble(TopicPerformance::getAccuracy))
                .map(TopicPerformance::getTopicName).orElse(null);
        SectionPerformance highestSection = sectionAnalytics.stream()
                .max(Comparator.comparingDouble(SectionPerformance::getAccuracy)).orElse(null);
        SectionPerformance lowestSection = sectionAnalytics.stream()
                .min(Comparator.comparingDouble(SectionPerformance::getAccuracy)).orElse(null);

        return new ClassroomReport(sessionId, totalStudents, participationRate, avgAccuracy, avgRt,
                sectionAnalytics, topicAnalytics, conceptAnalytics, mostDifficult, mostDifficultTopic,
                highestSection, lowestSection, new LearningProgression(List.of(), List.of(), "UNKNOWN", 0));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractSummary(Map<String, Object> sessionData) {
        Map<String, Object> summary = (Map<String, Object>) sessionData.get("summary");
        return summary != null ? summary : sessionData;
    }

    @SuppressWarnings("unchecked")
    private List<SectionPerformance> extractSectionPerformance(Map<String, Object> studentData) {
        if (studentData == null) return List.of();
        List<Map<String, Object>> sections = (List<Map<String, Object>>) studentData.get("sections");
        if (sections == null) return List.of();
        return sections.stream().map(s -> new SectionPerformance(
                (String) s.get("sectionId"), (String) s.get("sectionName"),
                toDouble(s.get("accuracy")), toInt(s.get("questionsAttempted")),
                toInt(s.get("questionsCorrect")), toDouble(s.get("averageResponseTimeMs")),
                toInt(s.get("totalStudents"))
        )).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<TopicPerformance> extractTopicPerformance(Map<String, Object> studentData) {
        if (studentData == null) return List.of();
        List<Map<String, Object>> topics = (List<Map<String, Object>>) studentData.get("topics");
        if (topics == null) return List.of();
        return topics.stream().map(t -> new TopicPerformance(
                (String) t.get("topicId"), (String) t.get("topicName"),
                toDouble(t.get("accuracy")), toInt(t.get("questionsAttempted")),
                toInt(t.get("questionsCorrect")), toDouble(t.get("averageResponseTimeMs"))
        )).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<ConceptPerformance> extractConceptPerformance(Map<String, Object> studentData) {
        if (studentData == null) return List.of();
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) studentData.get("concepts");
        if (concepts == null) return List.of();
        return concepts.stream().map(c -> new ConceptPerformance(
                (String) c.get("conceptId"), (String) c.get("conceptName"),
                toDouble(c.get("accuracy")), toInt(c.get("questionsAttempted")),
                toInt(c.get("questionsCorrect")), toDouble(c.get("averageResponseTimeMs")),
                (String) c.get("trend")
        )).collect(Collectors.toList());
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
