package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.SessionReport;
import com.spandan.reporting.domain.report.component.EngagementSummary;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class SessionReportBuilder {

    @SuppressWarnings("unchecked")
    public SessionReport build(String sessionId, Map<String, Object> sessionData) {
        if (sessionData == null) return null;

        Map<String, Object> summary = (Map<String, Object>) sessionData.get("summary");
        if (summary == null) summary = sessionData;

        int totalQuestions = toInt(summary.get("totalQuestions"));
        int totalStudents = toInt(summary.get("totalStudents"));
        double accuracy = toDouble(summary.get("overallAccuracy"));
        double avgRt = toDouble(summary.get("averageResponseTimeMs"));

        ParticipationSummary participation = new ParticipationSummary(
                totalStudents, toInt(summary.get("totalAnswered")),
                totalStudents > 0 ? totalQuestions : 0,
                totalStudents > 0 ? (double) toInt(summary.get("totalAnswered")) / totalStudents : 0,
                0, 0.0);

        PerformanceSummary performance = new PerformanceSummary(
                accuracy, avgRt, totalQuestions,
                toInt(summary.get("totalCorrect")), toInt(summary.get("totalIncorrect")),
                toInt(summary.get("totalSkipped")), accuracy * 100);

        EngagementSummary engagement = new EngagementSummary(
                "UNKNOWN", participation.getParticipationRate(), 0, 0, "UNKNOWN");

        List<String> topics = extractList(summary, "topicsCovered");
        List<String> concepts = extractList(summary, "conceptsCovered");
        List<String> sections = extractList(summary, "sectionsCovered");

        return new SessionReport(sessionId,
                (String) summary.get("lectureId"), (String) summary.get("teacherId"),
                participation, performance, engagement, topics, concepts, sections, summary);
    }

    private int toInt(Object val) {
        if (val instanceof Number n) return n.intValue();
        return 0;
    }

    private double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        return 0.0;
    }

    @SuppressWarnings("unchecked")
    private List<String> extractList(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof List) return (List<String>) val;
        return List.of();
    }
}
