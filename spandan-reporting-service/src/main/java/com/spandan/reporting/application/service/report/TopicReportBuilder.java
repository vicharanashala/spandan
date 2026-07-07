package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.ConceptReport;
import com.spandan.reporting.domain.report.TopicReport;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class TopicReportBuilder {

    public TopicReport build(String sessionId, String topicId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return null;

        Map<String, Object> topicEntry = findTopic(studentData, topicId);
        if (topicEntry == null) return null;

        PerformanceSummary performance = new PerformanceSummary(
                toDouble(topicEntry.get("accuracy")), toDouble(topicEntry.get("averageResponseTimeMs")),
                toInt(topicEntry.get("questionsAttempted")), toInt(topicEntry.get("questionsCorrect")),
                toInt(topicEntry.get("questionsIncorrect")), 0, 0);

        List<ConceptReport> concepts = extractConcepts(topicEntry);

        return new TopicReport(topicId, (String) topicEntry.get("topicName"), performance, concepts);
    }

    @SuppressWarnings("unchecked")
    public List<TopicReport> buildAll(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return List.of();

        List<Map<String, Object>> topics = (List<Map<String, Object>>) studentData.get("topics");
        if (topics == null) return List.of();

        return topics.stream()
                .map(t -> build(sessionId, (String) t.get("topicId"), orchestrator))
                .filter(r -> r != null)
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findTopic(Map<String, Object> studentData, String topicId) {
        List<Map<String, Object>> topics = (List<Map<String, Object>>) studentData.get("topics");
        if (topics == null) return null;
        return topics.stream()
                .filter(t -> topicId.equals(t.get("topicId")))
                .findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private List<ConceptReport> extractConcepts(Map<String, Object> topic) {
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) topic.get("concepts");
        if (concepts == null) return List.of();
        return concepts.stream().map(c -> new ConceptReport(
                (String) c.get("conceptId"), (String) c.get("conceptName"),
                toDouble(c.get("masteryPct")), toInt(c.get("totalAttempts")),
                toInt(c.get("totalCorrect")), toInt(c.get("sessionsCovered")),
                toDouble(c.get("lastAccuracy")), (String) c.get("trend")
        )).collect(Collectors.toList());
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
