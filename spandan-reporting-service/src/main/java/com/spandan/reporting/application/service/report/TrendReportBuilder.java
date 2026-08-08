package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.TrendReport;
import com.spandan.reporting.domain.report.TrendReport.SessionSnapshot;
import com.spandan.reporting.domain.report.component.PerformanceSummary;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class TrendReportBuilder {

    public TrendReport build(String studentId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> historicalData = orchestrator.getReportData(studentId, "STUDENT");
        if (historicalData == null) {
            return new TrendReport(studentId, List.of(), "UNKNOWN", "UNKNOWN", "UNKNOWN", List.of());
        }

        List<String> sessionIds = extractSessionIds(historicalData);
        List<SessionSnapshot> snapshots = extractSnapshots(historicalData);

        String accuracyTrend = calculateTrend(snapshots, true);
        String participationTrend = calculateTrend(snapshots, false);

        return new TrendReport(studentId, sessionIds, accuracyTrend, participationTrend,
                "UNKNOWN", snapshots);
    }

    @SuppressWarnings("unchecked")
    private List<String> extractSessionIds(Map<String, Object> data) {
        List<String> ids = (List<String>) data.get("sessionIds");
        return ids != null ? ids : List.of();
    }

    @SuppressWarnings("unchecked")
    private List<SessionSnapshot> extractSnapshots(Map<String, Object> data) {
        List<Map<String, Object>> sessions = (List<Map<String, Object>>) data.get("sessions");
        if (sessions == null) return List.of();

        List<SessionSnapshot> snapshots = new ArrayList<>();
        for (Map<String, Object> s : sessions) {
            PerformanceSummary perf = new PerformanceSummary(
                    toDouble(s.get("accuracy")), toDouble(s.get("averageResponseTimeMs")),
                    toInt(s.get("totalAnswered")), toInt(s.get("totalCorrect")),
                    toInt(s.get("totalIncorrect")), 0, toDouble(s.get("totalScore")));
            snapshots.add(new SessionSnapshot(
                    (String) s.get("sessionId"), perf,
                    toDouble(s.get("participationRate")), (String) s.get("generatedAt")));
        }
        return snapshots;
    }

    private String calculateTrend(List<SessionSnapshot> snapshots, boolean useAccuracy) {
        if (snapshots.size() < 2) return "UNKNOWN";
        double first = useAccuracy ? snapshots.get(0).getPerformance().getOverallAccuracy()
                : snapshots.get(0).getParticipationRate();
        double last = useAccuracy ? snapshots.get(snapshots.size() - 1).getPerformance().getOverallAccuracy()
                : snapshots.get(snapshots.size() - 1).getParticipationRate();
        if (last > first) return "IMPROVING";
        if (last < first) return "DECLINING";
        return "STABLE";
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
