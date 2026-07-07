package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.ConceptReport;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class ConceptReportBuilder {

    public ConceptReport build(String sessionId, String conceptId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return null;

        Map<String, Object> conceptEntry = findConcept(studentData, conceptId);
        if (conceptEntry == null) return null;

        return new ConceptReport(conceptId, (String) conceptEntry.get("conceptName"),
                toDouble(conceptEntry.get("masteryPct")), toInt(conceptEntry.get("totalAttempts")),
                toInt(conceptEntry.get("totalCorrect")), toInt(conceptEntry.get("sessionsCovered")),
                toDouble(conceptEntry.get("lastAccuracy")), (String) conceptEntry.get("trend"));
    }

    @SuppressWarnings("unchecked")
    public List<ConceptReport> buildAll(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return List.of();

        List<Map<String, Object>> concepts = (List<Map<String, Object>>) studentData.get("concepts");
        if (concepts == null) return List.of();

        return concepts.stream()
                .map(c -> new ConceptReport(
                        (String) c.get("conceptId"), (String) c.get("conceptName"),
                        toDouble(c.get("masteryPct")), toInt(c.get("totalAttempts")),
                        toInt(c.get("totalCorrect")), toInt(c.get("sessionsCovered")),
                        toDouble(c.get("lastAccuracy")), (String) c.get("trend")))
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findConcept(Map<String, Object> studentData, String conceptId) {
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) studentData.get("concepts");
        if (concepts == null) return null;
        return concepts.stream()
                .filter(c -> conceptId.equals(c.get("conceptId")))
                .findFirst().orElse(null);
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
