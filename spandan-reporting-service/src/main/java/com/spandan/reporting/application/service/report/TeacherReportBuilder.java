package com.spandan.reporting.application.service.report;

import com.spandan.reporting.domain.report.TeacherReport;
import com.spandan.reporting.domain.report.TeacherReport.StudentAttention;
import com.spandan.reporting.domain.report.component.ConceptPerformance;
import com.spandan.reporting.domain.report.component.LearningProgression;
import com.spandan.reporting.domain.report.component.ParticipationSummary;
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
public class TeacherReportBuilder {

    public TeacherReport build(String sessionId, ReportAssemblyOrchestrator orchestrator) {
        Map<String, Object> sessionData = orchestrator.getReportData(sessionId, "SESSION");
        Map<String, Object> studentData = orchestrator.getReportData(sessionId, "STUDENT");
        Map<String, Object> questionData = orchestrator.getReportData(sessionId, "QUESTION");
        if (sessionData == null) return null;

        Map<String, Object> summary = extractSummary(sessionData);
        int totalStudents = toInt(summary.get("totalStudents"));

        ParticipationSummary participation = buildClassParticipation(summary, studentData);
        PerformanceSummary performance = buildClassPerformance(summary, studentData);
        List<SectionPerformance> sectionPerf = extractSectionPerformance(studentData);
        List<TopicPerformance> topicPerf = extractTopicPerformance(studentData);
        List<ConceptPerformance> conceptPerf = extractConceptPerformance(studentData);
        List<ConceptPerformance> weakConcepts = extractWeakConcepts(conceptPerf);
        List<ConceptPerformance> strongConcepts = extractStrongConcepts(conceptPerf);
        LearningProgression learningTrend = extractLearningTrend(questionData);
        List<StudentAttention> attentionStudents = extractAttentionStudents(studentData);

        return new TeacherReport(sessionId, totalStudents, participation, performance,
                sectionPerf, topicPerf, conceptPerf, weakConcepts, strongConcepts,
                learningTrend, attentionStudents);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractSummary(Map<String, Object> sessionData) {
        Map<String, Object> summary = (Map<String, Object>) sessionData.get("summary");
        return summary != null ? summary : sessionData;
    }

    @SuppressWarnings("unchecked")
    private ParticipationSummary buildClassParticipation(Map<String, Object> summary,
                                                          Map<String, Object> studentData) {
        int totalStudents = toInt(summary.get("totalStudents"));
        int totalAnswered = toInt(summary.get("totalAnswered"));
        int totalQuestions = toInt(summary.get("totalQuestions"));
        return new ParticipationSummary(totalStudents, totalAnswered,
                totalQuestions * totalStudents,
                totalStudents > 0 ? (double) totalAnswered / (totalQuestions * totalStudents) : 0,
                toInt(summary.get("totalTimedOut")), 0);
    }

    private PerformanceSummary buildClassPerformance(Map<String, Object> summary,
                                                      Map<String, Object> studentData) {
        return new PerformanceSummary(
                toDouble(summary.get("overallAccuracy")), toDouble(summary.get("averageResponseTimeMs")),
                toInt(summary.get("totalQuestions")), toInt(summary.get("totalCorrect")),
                toInt(summary.get("totalIncorrect")), toInt(summary.get("totalSkipped")),
                toDouble(summary.get("overallAccuracy")) * 100);
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

    private List<ConceptPerformance> extractWeakConcepts(List<ConceptPerformance> concepts) {
        return concepts.stream()
                .sorted(Comparator.comparingDouble(ConceptPerformance::getAccuracy))
                .limit(5).collect(Collectors.toList());
    }

    private List<ConceptPerformance> extractStrongConcepts(List<ConceptPerformance> concepts) {
        return concepts.stream()
                .sorted(Comparator.comparingDouble(ConceptPerformance::getAccuracy).reversed())
                .limit(5).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private LearningProgression extractLearningTrend(Map<String, Object> questionData) {
        if (questionData == null) return new LearningProgression(List.of(), List.of(), "UNKNOWN", 0);
        List<Map<String, Object>> questions = (List<Map<String, Object>>) questionData.get("questions");
        if (questions == null || questions.isEmpty())
            return new LearningProgression(List.of(), List.of(), "UNKNOWN", 0);

        List<Double> accuracies = questions.stream()
                .map(q -> toDouble(q.get("accuracyPct")))
                .collect(Collectors.toList());

        if (accuracies.size() < 2) return new LearningProgression(accuracies, List.of(), "STABLE", 0);

        double first = accuracies.get(0);
        double last = accuracies.get(accuracies.size() - 1);
        String trend = last > first ? "IMPROVING" : last < first ? "DECLINING" : "STABLE";
        double rate = first > 0 ? ((last - first) / first) * 100 : 0;
        return new LearningProgression(accuracies, List.of(), trend, rate);
    }

    @SuppressWarnings("unchecked")
    private List<StudentAttention> extractAttentionStudents(Map<String, Object> studentData) {
        if (studentData == null) return List.of();
        List<Map<String, Object>> students = (List<Map<String, Object>>) studentData.get("students");
        if (students == null) return List.of();

        List<StudentAttention> attention = new ArrayList<>();
        for (Map<String, Object> s : students) {
            List<String> reasons = new ArrayList<>();
            double accuracy = toDouble(s.get("accuracy"));
            double participation = toDouble(s.get("participationRate"));
            double timeout = toDouble(s.get("timeoutRate"));
            String engagement = (String) s.get("engagementLevel");

            if (accuracy < 0.4) reasons.add("LOW_ACCURACY");
            if (participation < 0.5) reasons.add("LOW_PARTICIPATION");
            if (timeout > 0.25) reasons.add("HIGH_TIMEOUT_RATE");
            if ("LOW".equals(engagement)) reasons.add("LOW_ENGAGEMENT");

            if (!reasons.isEmpty()) {
                attention.add(new StudentAttention(
                        (String) s.get("studentId"), String.join(", ", reasons),
                        accuracy, participation, timeout, engagement));
            }
        }
        return attention;
    }

    private int toInt(Object val) { return val instanceof Number n ? n.intValue() : 0; }
    private double toDouble(Object val) { return val instanceof Number n ? n.doubleValue() : 0.0; }
}
