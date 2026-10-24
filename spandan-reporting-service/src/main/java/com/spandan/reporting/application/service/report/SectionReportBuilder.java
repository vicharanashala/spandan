package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.SectionReport;
import com.spandan.reporting.domain.report.SubsectionReport;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class SectionReportBuilder {

    public SectionReport build(String sessionId, String sectionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return null;

        Map<String, Object> sectionEntry = findSection(studentData, sectionId);
        if (sectionEntry == null) return null;

        PerformanceSummary performance = new PerformanceSummary(
                toDouble(sectionEntry.get("accuracy")), toDouble(sectionEntry.get("averageResponseTimeMs")),
                toInt(sectionEntry.get("questionsAttempted")), toInt(sectionEntry.get("questionsCorrect")),
                toInt(sectionEntry.get("questionsIncorrect")), 0, 0);

        List<SubsectionReport> subsections = extractSubsections(sectionEntry);

        return new SectionReport(sectionId, (String) sectionEntry.get("sectionName"),
                performance, subsections);
    }

    @SuppressWarnings("unchecked")
    public List<SectionReport> buildAll(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        if (studentData == null) return List.of();

        List<Map<String, Object>> sections = (List<Map<String, Object>>) studentData.get("sections");
        if (sections == null) return List.of();

        return sections.stream()
                .map(s -> build(sessionId, (String) s.get("sectionId"), orchestrator))
                .filter(r -> r != null)
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findSection(Map<String, Object> studentData, String sectionId) {
        List<Map<String, Object>> sections = (List<Map<String, Object>>) studentData.get("sections");
        if (sections == null) return null;
        return sections.stream()
                .filter(s -> sectionId.equals(s.get("sectionId")))
                .findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private List<SubsectionReport> extractSubsections(Map<String, Object> section) {
        List<Map<String, Object>> subs = (List<Map<String, Object>>) section.get("subsections");
        if (subs == null) return List.of();
        return subs.stream().map(sub -> new SubsectionReport(
                (String) sub.get("subsectionId"), (String) sub.get("subsectionName"),
                new PerformanceSummary(toDouble(sub.get("accuracy")), toDouble(sub.get("averageResponseTimeMs")),
                        toInt(sub.get("questionsAttempted")), toInt(sub.get("questionsCorrect")),
                        toInt(sub.get("questionsIncorrect")), 0, 0)
        )).collect(Collectors.toList());
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
