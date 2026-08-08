package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.LectureReport;
import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class LectureReportBuilder {

    public LectureReport build(String lectureId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> lectureData = orchestrator.getReportData(lectureId, "SESSION");
        if (lectureData == null) {
            return new LectureReport(lectureId, List.of(), List.of(), List.of(),
                    List.of(), List.of(), null, null, null, 0);
        }

        List<String> sessionIds = extractSessionIds(lectureData);
        List<String> sections = extractCovered(lectureData, "sectionsCovered");
        List<String> subsections = extractCovered(lectureData, "subsectionsCovered");
        List<String> topics = extractCovered(lectureData, "topicsCovered");
        List<String> concepts = extractCovered(lectureData, "conceptsCovered");

        int totalStudents = toInt(lectureData.get("totalStudents"));
        double accuracy = toDouble(lectureData.get("overallAccuracy"));
        double avgRt = toDouble(lectureData.get("averageResponseTimeMs"));

        PerformanceSummary performance = new PerformanceSummary(accuracy, avgRt,
                toInt(lectureData.get("totalQuestions")), toInt(lectureData.get("totalCorrect")),
                toInt(lectureData.get("totalIncorrect")), toInt(lectureData.get("totalSkipped")), accuracy * 100);

        ParticipationSummary participation = new ParticipationSummary(totalStudents,
                toInt(lectureData.get("totalAnswered")), toInt(lectureData.get("totalQuestions")) * totalStudents,
                totalStudents > 0 ? (double) toInt(lectureData.get("totalAnswered"))
                        / (toInt(lectureData.get("totalQuestions")) * totalStudents) : 0,
                toInt(lectureData.get("totalTimedOut")), 0);

        return new LectureReport(lectureId, sessionIds, sections, subsections, topics, concepts,
                performance, participation, new EngagementSummary(), totalStudents);
    }

    @SuppressWarnings("unchecked")
    private List<String> extractSessionIds(Map<String, Object> data) {
        List<String> ids = (List<String>) data.get("sessionIds");
        return ids != null ? ids : List.of();
    }

    @SuppressWarnings("unchecked")
    private List<String> extractCovered(Map<String, Object> data, String key) {
        List<String> covered = (List<String>) data.get(key);
        return covered != null ? covered : List.of();
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
