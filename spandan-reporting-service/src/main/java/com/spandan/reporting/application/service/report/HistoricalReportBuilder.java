package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.HistoricalReport;
import com.spandan.reporting.domain.report.HistoricalReport.ConceptHistoryEntry;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class HistoricalReportBuilder {

    public HistoricalReport build(String studentId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> historicalData = orchestrator.getReportData(studentId, "STUDENT");
        if (historicalData == null) return null;

        Map<String, Object> history = extractHistoryMap(historicalData);
        if (history == null) return buildFromFlat(historicalData, studentId);

        return new HistoricalReport(studentId,
                toInt(history.get("totalSessions")), toDouble(history.get("averageAccuracy")),
                toDouble(history.get("averageParticipationRate")),
                (String) history.get("accuracyTrend"), (String) history.get("participationTrend"),
                toDouble(history.get("lastSessionAccuracy")),
                toDouble(history.get("lastSessionResponseTimeMs")),
                extractConceptHistory(history));
    }

    private HistoricalReport buildFromFlat(Map<String, Object> data, String studentId) {
        return new HistoricalReport(studentId, 1, toDouble(data.get("accuracy")),
                0, "UNKNOWN", "UNKNOWN", toDouble(data.get("accuracy")),
                toDouble(data.get("averageResponseTimeMs")), List.of());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractHistoryMap(Map<String, Object> data) {
        Map<String, Object> history = (Map<String, Object>) data.get("historical");
        if (history == null) history = (Map<String, Object>) data.get("history");
        return history;
    }

    @SuppressWarnings("unchecked")
    private List<ConceptHistoryEntry> extractConceptHistory(Map<String, Object> history) {
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) history.get("conceptHistory");
        if (concepts == null) return List.of();
        return concepts.stream().map(c -> new ConceptHistoryEntry(
                (String) c.get("conceptId"), (String) c.get("conceptName"),
                toInt(c.get("totalAttempts")), toInt(c.get("totalCorrect")),
                toDouble(c.get("masteryPct")), toInt(c.get("sessionsCovered")),
                toDouble(c.get("lastAccuracy"))
        )).collect(Collectors.toList());
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
