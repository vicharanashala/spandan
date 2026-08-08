package com.spandan.analytics.application.service;

import com.spandan.analytics.application.service.classroom.ClassroomAnalyticsService;
import com.spandan.analytics.application.service.feature.FeatureEngineeringService;
import com.spandan.analytics.application.service.feature.FeatureEngineeringService.FeatureEngineeringResult;
import com.spandan.analytics.application.service.intelligence.EducationalIntelligenceOrchestrator;
import com.spandan.analytics.application.service.leaderboard.LeaderboardService;
import com.spandan.analytics.application.service.student.StudentAnalyticsService;
import com.spandan.analytics.domain.exception.AnalyticsException;
import com.spandan.analytics.infrastructure.kafka.producers.AnalyticsEventProducer;
import com.spandan.analytics.infrastructure.rest.ResponseServiceRestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AnalyticsOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsOrchestrator.class);

    private final ResponseServiceRestClient responseClient;
    private final FeatureEngineeringService featureEngineeringService;
    private final StudentAnalyticsService studentAnalyticsService;
    private final ClassroomAnalyticsService classroomAnalyticsService;
    private final EducationalIntelligenceOrchestrator intelligenceOrchestrator;
    private final LeaderboardService leaderboardService;
    private final AnalyticsEventProducer eventProducer;

    public AnalyticsOrchestrator(ResponseServiceRestClient responseClient,
                                  FeatureEngineeringService featureEngineeringService,
                                  StudentAnalyticsService studentAnalyticsService,
                                  ClassroomAnalyticsService classroomAnalyticsService,
                                  EducationalIntelligenceOrchestrator intelligenceOrchestrator,
                                  LeaderboardService leaderboardService,
                                  AnalyticsEventProducer eventProducer) {
        this.responseClient = responseClient;
        this.featureEngineeringService = featureEngineeringService;
        this.studentAnalyticsService = studentAnalyticsService;
        this.classroomAnalyticsService = classroomAnalyticsService;
        this.intelligenceOrchestrator = intelligenceOrchestrator;
        this.leaderboardService = leaderboardService;
        this.eventProducer = eventProducer;
    }

    public void processSessionCompleted(UUID sessionId) {
        log.info("Processing session completion for sessionId={}", sessionId);
        processFullPipeline(sessionId, null);
    }

    public void processQuizCompleted(UUID quizId, String teacherId) {
        log.info("Processing QuizCompleted (legacy path) for quizId={}", quizId);
        processFullPipeline(quizId, teacherId);
    }

    private void processFullPipeline(UUID sessionId, String teacherId) {
        try {
            List<Map<String, Object>> interactions = responseClient.fetchSessionResponses(sessionId);

            if (interactions == null || interactions.isEmpty()) {
                log.warn("No interactions returned for sessionId={}", sessionId);
            }

            FeatureEngineeringResult features = featureEngineeringService
                    .computeFeaturesFromInteractions(sessionId, interactions);

            studentAnalyticsService.computeStudentAnalytics(sessionId);

            classroomAnalyticsService.computeClassroomAnalytics(sessionId, interactions);

            intelligenceOrchestrator.executeModules(sessionId,
                    features.studentFeatures(), features.educationalFeatures());

            leaderboardService.computeLeaderboard(sessionId);

            publishAnalyticsEvents(sessionId, interactions, teacherId);

            log.info("Full analytics pipeline complete for sessionId={}", sessionId);
        } catch (Exception e) {
            log.error("Failed to process analytics for sessionId={}: {}", sessionId, e.getMessage(), e);
            throw new AnalyticsException("Analytics processing failed: " + e.getMessage(), 500);
        }
    }

    private void publishAnalyticsEvents(UUID sessionId, List<Map<String, Object>> interactions, String teacherId) {
        String sessionIdStr = sessionId.toString();

        Map<String, Object> sessionSummary = buildSessionSummary(sessionId, interactions);
        Map<String, Object> sessionData = new HashMap<>();
        sessionData.put("totalInteractions", interactions != null ? interactions.size() : 0);
        sessionData.put("sessionId", sessionIdStr);

        eventProducer.publishAnalyticsGeneratedEvent(sessionIdStr, "SESSION", sessionData, sessionSummary);
        eventProducer.publishAnalyticsGeneratedEvent(sessionIdStr, "QUESTION", sessionData, sessionSummary);
        eventProducer.publishAnalyticsGeneratedEvent(sessionIdStr, "STUDENT", sessionData, sessionSummary);
        eventProducer.publishAnalyticsGeneratedEvent(sessionIdStr, "LEADERBOARD", sessionData, sessionSummary);
        eventProducer.publishAnalyticsGeneratedEvent(sessionIdStr, "LEARNING_OBJECTIVE", sessionData, sessionSummary);

        eventProducer.publishSessionAnalyticsCompleted(sessionIdStr, teacherId);

        eventProducer.publishAnalyticsCompleted(sessionId);
        eventProducer.publishLeaderboardGenerated(sessionId);
        eventProducer.publishStudentAnalyticsReady(sessionId);
        eventProducer.publishTeacherAnalyticsReady(sessionId);
    }

    private Map<String, Object> buildSessionSummary(UUID sessionId, List<Map<String, Object>> interactions) {
        Map<String, Object> summary = new HashMap<>();
        if (interactions == null || interactions.isEmpty()) {
            summary.put("totalQuestions", 0);
            summary.put("totalStudents", 0);
            summary.put("overallAccuracy", 0);
            summary.put("averageResponseTimeMs", 0);
            return summary;
        }

        long uniqueQuestions = interactions.stream()
                .map(i -> (String) i.get("questionId"))
                .distinct().count();
        long uniqueStudents = interactions.stream()
                .map(i -> (String) i.get("studentId"))
                .distinct().count();
        long answered = interactions.stream()
                .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                .count();
        long correct = interactions.stream()
                .filter(i -> Boolean.TRUE.equals(i.get("isCorrect")))
                .count();
        double accuracy = answered > 0 ? (double) correct / answered : 0;

        double avgRtMs = interactions.stream()
                .filter(i -> i.get("responseTimeMs") != null)
                .mapToLong(i -> {
                    Object rt = i.get("responseTimeMs");
                    if (rt instanceof Number n) return n.longValue();
                    return 0;
                })
                .average().orElse(0);

        summary.put("totalQuestions", (int) uniqueQuestions);
        summary.put("totalStudents", (int) uniqueStudents);
        summary.put("overallAccuracy", Math.round(accuracy * 10000.0) / 100.0);
        summary.put("averageResponseTimeMs", Math.round(avgRtMs));
        return summary;
    }
}
