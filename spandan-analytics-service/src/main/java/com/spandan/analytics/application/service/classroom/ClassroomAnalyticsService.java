package com.spandan.analytics.application.service.classroom;

import com.spandan.analytics.domain.entity.EngagementMetrics;
import com.spandan.analytics.domain.entity.SessionAnalytics;
import com.spandan.analytics.domain.entity.QuestionAnalytics;
import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.SessionFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.infrastructure.persistence.EngagementMetricsRepository;
import com.spandan.analytics.infrastructure.persistence.SessionAnalyticsJpaRepository;
import com.spandan.analytics.infrastructure.persistence.QuestionAnalyticsJpaRepository;
import com.spandan.analytics.infrastructure.persistence.feature.EducationalFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.SessionFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.StudentFeaturesRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Service
public class ClassroomAnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(ClassroomAnalyticsService.class);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final SessionAnalyticsJpaRepository sessionRepo;
    private final QuestionAnalyticsJpaRepository questionRepo;
    private final EngagementMetricsRepository engagementRepo;
    private final StudentFeaturesRepository studentFeaturesRepo;
    private final EducationalFeaturesRepository educationalFeaturesRepo;
    private final SessionFeaturesRepository sessionFeaturesRepo;

    public ClassroomAnalyticsService(SessionAnalyticsJpaRepository sessionRepo,
                                      QuestionAnalyticsJpaRepository questionRepo,
                                      EngagementMetricsRepository engagementRepo,
                                      StudentFeaturesRepository studentFeaturesRepo,
                                      EducationalFeaturesRepository educationalFeaturesRepo,
                                      SessionFeaturesRepository sessionFeaturesRepo) {
        this.sessionRepo = sessionRepo;
        this.questionRepo = questionRepo;
        this.engagementRepo = engagementRepo;
        this.studentFeaturesRepo = studentFeaturesRepo;
        this.educationalFeaturesRepo = educationalFeaturesRepo;
        this.sessionFeaturesRepo = sessionFeaturesRepo;
    }

    @Transactional
    public void computeClassroomAnalytics(UUID sessionId, List<Map<String, Object>> interactions) {
        List<StudentFeatures> studentFeatures = studentFeaturesRepo.findBySessionId(sessionId);
        SessionFeatures sessionFeatures = sessionFeaturesRepo.findBySessionId(sessionId).orElse(null);

        computeAndPersistSessionAnalytics(sessionId, studentFeatures, sessionFeatures);
        computeAndPersistQuestionAnalytics(sessionId, interactions);
        computeAndPersistEngagementMetrics(sessionId, studentFeatures);

        log.info("Classroom analytics computed for session {}", sessionId);
    }

    void computeAndPersistSessionAnalytics(UUID sessionId, List<StudentFeatures> studentFeatures,
                                            SessionFeatures sessionFeatures) {
        sessionRepo.findByQuizId(sessionId).ifPresentOrElse(
                existing -> {},
                () -> {
                    int totalStudents = studentFeatures.size();
                    AtomicInteger totalQuestions = new AtomicInteger(0);

                    BigDecimal classAccuracy = studentFeatures.stream()
                            .map(sf -> {
                                int total = sf.getTotalCorrect() + sf.getTotalIncorrect();
                                totalQuestions.accumulateAndGet(sf.getTotalQuestionsDisplayed(), Math::max);
                                return total > 0
                                        ? BigDecimal.valueOf(sf.getTotalCorrect())
                                                .multiply(HUNDRED)
                                                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)
                                        : BigDecimal.ZERO;
                            })
                            .reduce(BigDecimal.ZERO, BigDecimal::add);

                    if (!studentFeatures.isEmpty()) {
                        classAccuracy = classAccuracy.divide(BigDecimal.valueOf(studentFeatures.size()),
                                2, RoundingMode.HALF_UP);
                    }

                    BigDecimal participationRate = sessionFeatures != null
                            ? sessionFeatures.getCompletionRate()
                            : BigDecimal.ZERO;

                    BigDecimal avgRtSeconds = studentFeatures.stream()
                            .map(sf -> BigDecimal.valueOf(sf.getAverageResponseTimeMs())
                                    .divide(BigDecimal.valueOf(1000), 2, RoundingMode.HALF_UP))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);

                    if (!studentFeatures.isEmpty()) {
                        avgRtSeconds = avgRtSeconds.divide(BigDecimal.valueOf(studentFeatures.size()),
                                2, RoundingMode.HALF_UP);
                    }

                    SessionAnalytics analytics = new SessionAnalytics(sessionId, totalQuestions.get(),
                            totalStudents, classAccuracy, participationRate, avgRtSeconds);
                    sessionRepo.save(analytics);
                });
    }

    void computeAndPersistQuestionAnalytics(UUID sessionId, List<Map<String, Object>> interactions) {
        List<QuestionAnalytics> existing = questionRepo.findByQuizIdOrderByQuestionId(sessionId);
        if (!existing.isEmpty()) questionRepo.deleteAll(existing);

        Map<UUID, List<Map<String, Object>>> byQuestion = interactions.stream()
                .filter(i -> i.get("answered") != null || i.get("timeout") != null)
                .collect(Collectors.groupingBy(
                        i -> UUID.fromString((String) i.get("questionId"))));

        List<QuestionAnalytics> analytics = new ArrayList<>();

        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byQuestion.entrySet()) {
            UUID questionId = entry.getKey();
            List<Map<String, Object>> questionInteractions = entry.getValue();

            int correct = (int) questionInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("isCorrect")))
                    .count();
            int incorrect = (int) questionInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("answered")) && !Boolean.TRUE.equals(i.get("isCorrect")))
                    .count();
            int skipped = (int) questionInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("timeout")) || !Boolean.TRUE.equals(i.get("answered")))
                    .count();
            int received = correct + incorrect;

            BigDecimal accuracy = received > 0
                    ? BigDecimal.valueOf(correct).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(received), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            double avgRtMs = questionInteractions.stream()
                    .filter(i -> i.get("responseTimeMs") != null)
                    .mapToLong(i -> {
                        Object rt = i.get("responseTimeMs");
                        if (rt instanceof Number n) return n.longValue();
                        return 0L;
                    })
                    .average().orElse(0);
            BigDecimal avgRtSeconds = BigDecimal.valueOf(avgRtMs / 1000.0).setScale(2, RoundingMode.HALF_UP);

            int totalForQuestion = questionInteractions.size();
            BigDecimal skipRate = totalForQuestion > 0
                    ? BigDecimal.valueOf(skipped).divide(BigDecimal.valueOf(totalForQuestion), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            double rawDifficulty = 0.5 * (1 - accuracy.doubleValue() / 100.0)
                    + 0.3 * Math.min(avgRtSeconds.doubleValue() / 60.0, 1.0)
                    + 0.2 * skipRate.doubleValue();
            BigDecimal difficulty = BigDecimal.valueOf(rawDifficulty * 100).setScale(2, RoundingMode.HALF_UP);

            analytics.add(new QuestionAnalytics(sessionId, questionId, received,
                    correct, incorrect, skipped, accuracy, avgRtSeconds, difficulty));
        }

        if (!analytics.isEmpty()) questionRepo.saveAll(analytics);
    }

    void computeAndPersistEngagementMetrics(UUID sessionId, List<StudentFeatures> studentFeatures) {
        List<EngagementMetrics> existing = engagementRepo.findBySessionId(sessionId);
        if (!existing.isEmpty()) engagementRepo.deleteAll(existing);

        List<EngagementMetrics> metricsList = studentFeatures.stream()
                .map(sf -> {
                    BigDecimal timeoutRate = sf.getTimeoutPercentage();
                    BigDecimal participationRate = sf.getParticipationRate();

                    String responseTimeTrend = computeResponseTimeTrend(sf);
                    String engagementLevel = computeEngagementLevel(participationRate, timeoutRate, responseTimeTrend);

                    return new EngagementMetrics(sessionId, sf.getStudentId(), responseTimeTrend,
                            timeoutRate, participationRate, engagementLevel,
                            sf.getTotalAnswered(), sf.getTotalQuestionsDisplayed());
                })
                .collect(Collectors.toList());

        if (!metricsList.isEmpty()) engagementRepo.saveAll(metricsList);
    }

    private String computeResponseTimeTrend(StudentFeatures sf) {
        if (sf.getAverageResponseTimeMs() <= 0) return "STABLE";
        if (sf.getResponseTimeConsistency().doubleValue() < 30) return "IMPROVING";
        if (sf.getResponseTimeConsistency().doubleValue() > 70) return "DECLINING";
        return "STABLE";
    }

    private String computeEngagementLevel(BigDecimal participationRate, BigDecimal timeoutRate, String trend) {
        if (participationRate.compareTo(BigDecimal.valueOf(80)) >= 0
                && timeoutRate.compareTo(BigDecimal.valueOf(10)) < 0
                && !"DECLINING".equals(trend)) {
            return "HIGH";
        }
        if (participationRate.compareTo(BigDecimal.valueOf(50)) >= 0
                && timeoutRate.compareTo(BigDecimal.valueOf(25)) < 0) {
            return "MEDIUM";
        }
        return "LOW";
    }

    public SessionAnalytics getSessionAnalytics(UUID sessionId) {
        return sessionRepo.findByQuizId(sessionId).orElse(null);
    }

    public List<QuestionAnalytics> getQuestionAnalytics(UUID sessionId) {
        return questionRepo.findByQuizIdOrderByQuestionId(sessionId);
    }

    public List<EngagementMetrics> getEngagementMetrics(UUID sessionId) {
        return engagementRepo.findBySessionId(sessionId);
    }

    public List<EducationalFeatures> getConceptPerformance(UUID sessionId) {
        return educationalFeaturesRepo.findBySessionIdAndEducationalLevel(sessionId, "CONCEPT");
    }

    public List<Map.Entry<String, BigDecimal>> getDifficultConcepts(UUID sessionId) {
        return getConceptPerformance(sessionId).stream()
                .collect(Collectors.groupingBy(
                        ef -> ef.getEducationalId() != null ? ef.getEducationalId() : "unknown",
                        Collectors.averagingDouble(ef -> ef.getAccuracy().doubleValue())))
                .entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .limit(5)
                .map(e -> Map.entry(e.getKey(), BigDecimal.valueOf(e.getValue()).setScale(2, RoundingMode.HALF_UP)))
                .collect(Collectors.toList());
    }

    public List<Map.Entry<String, BigDecimal>> getEasyConcepts(UUID sessionId) {
        return getConceptPerformance(sessionId).stream()
                .collect(Collectors.groupingBy(
                        ef -> ef.getEducationalId() != null ? ef.getEducationalId() : "unknown",
                        Collectors.averagingDouble(ef -> ef.getAccuracy().doubleValue())))
                .entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(5)
                .map(e -> Map.entry(e.getKey(), BigDecimal.valueOf(e.getValue()).setScale(2, RoundingMode.HALF_UP)))
                .collect(Collectors.toList());
    }

    public List<UUID> getStudentsRequiringAttention(UUID sessionId) {
        List<EngagementMetrics> metrics = engagementRepo.findBySessionId(sessionId);
        return metrics.stream()
                .filter(m -> "LOW".equals(m.getEngagementLevel())
                        || m.getParticipationRate().compareTo(BigDecimal.valueOf(40)) < 0
                        || m.getTimeoutRate().compareTo(BigDecimal.valueOf(30)) > 0)
                .map(EngagementMetrics::getStudentId)
                .collect(Collectors.toList());
    }
}
