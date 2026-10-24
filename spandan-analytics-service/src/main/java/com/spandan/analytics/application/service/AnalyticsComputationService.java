package com.spandan.analytics.application.service;

import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.infrastructure.persistence.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnalyticsComputationService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsComputationService.class);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final double W1 = 0.5;
    private static final double W2 = 0.3;
    private static final double W3 = 0.2;

    private final SessionAnalyticsJpaRepository sessionRepo;
    private final QuestionAnalyticsJpaRepository questionRepo;
    private final StudentPerformanceJpaRepository studentRepo;
    private final LeaderboardEntryJpaRepository leaderboardRepo;
    private final LearningObjectiveMasteryRepository loRepo;
    private final EngagementMetricsRepository engagementRepo;

    public AnalyticsComputationService(SessionAnalyticsJpaRepository sessionRepo,
                                       QuestionAnalyticsJpaRepository questionRepo,
                                       StudentPerformanceJpaRepository studentRepo,
                                       LeaderboardEntryJpaRepository leaderboardRepo,
                                       LearningObjectiveMasteryRepository loRepo,
                                       EngagementMetricsRepository engagementRepo) {
        this.sessionRepo = sessionRepo;
        this.questionRepo = questionRepo;
        this.studentRepo = studentRepo;
        this.leaderboardRepo = leaderboardRepo;
        this.loRepo = loRepo;
        this.engagementRepo = engagementRepo;
    }

    @Transactional
    public void computeAnalytics(UUID sessionId, List<Map<String, Object>> interactions) {
        Map<UUID, List<Map<String, Object>>> byQuestion = interactions.stream()
                .filter(i -> "ANSWERED".equals(i.get("eventType")) || "TIMED_OUT".equals(i.get("eventType")))
                .collect(Collectors.groupingBy(
                        i -> UUID.fromString((String) i.get("questionId"))));

        List<QuestionAnalytics> questionAnalyticsList = new ArrayList<>();
        int totalCorrect = 0;
        int totalResponses = 0;
        double totalResponseTimeMs = 0;
        int responseTimeCount = 0;

        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byQuestion.entrySet()) {
            UUID questionId = entry.getKey();
            List<Map<String, Object>> questionInteractions = entry.getValue();

            int correct = 0;
            int incorrect = 0;
            int skipped = 0;
            double sumResponseTimeMs = 0;
            int rtCount = 0;

            for (Map<String, Object> interaction : questionInteractions) {
                boolean isTimeout = Boolean.TRUE.equals(interaction.get("timeout"));
                boolean isAnswered = Boolean.TRUE.equals(interaction.get("answered"));

                if (isTimeout || !isAnswered) {
                    skipped++;
                    continue;
                }

                boolean isCorrect = Boolean.TRUE.equals(interaction.get("isCorrect"));
                if (isCorrect) correct++;
                else incorrect++;

                Long rtMs = getResponseTimeMs(interaction);
                if (rtMs != null) {
                    sumResponseTimeMs += rtMs;
                    rtCount++;
                }
            }

            int received = correct + incorrect;
            totalCorrect += correct;
            totalResponses += received;

            BigDecimal accuracy = received > 0
                    ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(received), 4, RoundingMode.HALF_UP)
                        .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal avgRtSeconds = rtCount > 0
                    ? BigDecimal.valueOf(sumResponseTimeMs / rtCount / 1000.0).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            int totalForQuestion = questionInteractions.size();
            BigDecimal skipRate = totalForQuestion > 0
                    ? BigDecimal.valueOf(skipped).divide(BigDecimal.valueOf(totalForQuestion), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            double rawDifficulty = W1 * (1 - accuracy.doubleValue() / 100.0)
                    + W2 * Math.min(avgRtSeconds.doubleValue() / 60.0, 1.0)
                    + W3 * skipRate.doubleValue();
            BigDecimal difficulty = BigDecimal.valueOf(rawDifficulty * 100)
                    .setScale(2, RoundingMode.HALF_UP);

            if (rtCount > 0) {
                totalResponseTimeMs += sumResponseTimeMs;
                responseTimeCount += rtCount;
            }

            questionAnalyticsList.add(new QuestionAnalytics(
                    sessionId, questionId, received, correct, incorrect, skipped,
                    accuracy, avgRtSeconds, difficulty));
        }

        questionRepo.deleteAll(questionRepo.findByQuizIdOrderByQuestionId(sessionId));
        questionRepo.saveAll(questionAnalyticsList);

        Map<UUID, List<Map<String, Object>>> byStudent = interactions.stream()
                .filter(i -> "ANSWERED".equals(i.get("eventType")) || "TIMED_OUT".equals(i.get("eventType")))
                .collect(Collectors.groupingBy(
                        i -> UUID.fromString((String) i.get("studentId"))));

        List<StudentPerformance> performances = new ArrayList<>();
        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byStudent.entrySet()) {
            UUID studentId = entry.getKey();
            List<Map<String, Object>> studentInteractions = entry.getValue();

            int correct = 0;
            int incorrect = 0;
            int skipped = 0;
            double sumRtMs = 0;
            int rtCount = 0;

            for (Map<String, Object> interaction : studentInteractions) {
                boolean isTimeout = Boolean.TRUE.equals(interaction.get("timeout"));
                boolean isAnswered = Boolean.TRUE.equals(interaction.get("answered"));

                if (isTimeout || !isAnswered) {
                    skipped++;
                    continue;
                }

                boolean isCorrect = Boolean.TRUE.equals(interaction.get("isCorrect"));
                if (isCorrect) correct++;
                else incorrect++;

                Long rtMs = getResponseTimeMs(interaction);
                if (rtMs != null) {
                    sumRtMs += rtMs;
                    rtCount++;
                }
            }

            int answered = correct + incorrect;
            BigDecimal accuracy = answered > 0
                    ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(answered), 4, RoundingMode.HALF_UP)
                        .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal avgRtSeconds = rtCount > 0
                    ? BigDecimal.valueOf(sumRtMs / rtCount / 1000.0).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal totalScore = BigDecimal.valueOf(correct);

            performances.add(new StudentPerformance(
                    sessionId, studentId, answered, correct, incorrect, skipped,
                    accuracy, totalScore, avgRtSeconds));
        }

        studentRepo.deleteAll(studentRepo.findByQuizId(sessionId));
        studentRepo.saveAll(performances);

        int totalStudents = performances.size();
        int totalQuestions = byQuestion.size();
        BigDecimal classAccuracy = totalResponses > 0
                ? BigDecimal.valueOf(totalCorrect).divide(BigDecimal.valueOf(totalResponses), 4, RoundingMode.HALF_UP)
                    .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal participationRate = totalStudents > 0 && totalQuestions > 0
                ? BigDecimal.valueOf(performances.stream()
                        .filter(p -> p.getTotalAnswered() > 0)
                        .count())
                    .divide(BigDecimal.valueOf(totalStudents), 4, RoundingMode.HALF_UP)
                    .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal classAvgRt = responseTimeCount > 0
                ? BigDecimal.valueOf(totalResponseTimeMs / responseTimeCount / 1000.0).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        sessionRepo.findByQuizId(sessionId).ifPresentOrElse(
                existing -> {},
                () -> sessionRepo.save(new SessionAnalytics(
                        sessionId, totalQuestions, totalStudents, classAccuracy,
                        participationRate, classAvgRt)));

        generateLeaderboard(sessionId, performances);

        computeLearningObjectiveMastery(sessionId, interactions);

        computeEngagementMetrics(sessionId, interactions);

        log.info("Analytics computed for session {}: {} questions, {} students", sessionId, totalQuestions, totalStudents);
    }

    @Transactional
    public void generateLeaderboard(UUID sessionId, List<StudentPerformance> performances) {
        leaderboardRepo.deleteByQuizId(sessionId);

        List<StudentPerformance> sorted = performances.stream()
                .sorted(Comparator
                        .comparing(StudentPerformance::getTotalScore).reversed()
                        .thenComparing(StudentPerformance::getAccuracyPct).reversed()
                        .thenComparing(StudentPerformance::getAverageResponseTimeSeconds))
                .collect(Collectors.toList());

        List<LeaderboardEntry> entries = new ArrayList<>();
        int currentRank = 0;
        int skippedRanks = 0;
        StudentPerformance previous = null;

        for (StudentPerformance sp : sorted) {
            currentRank++;
            if (previous != null
                    && sp.getTotalScore().compareTo(previous.getTotalScore()) == 0
                    && sp.getAccuracyPct().compareTo(previous.getAccuracyPct()) == 0
                    && sp.getAverageResponseTimeSeconds().compareTo(previous.getAverageResponseTimeSeconds()) == 0) {
                skippedRanks++;
            } else {
                currentRank = currentRank + skippedRanks;
                skippedRanks = 0;
            }
            entries.add(new LeaderboardEntry(
                    sessionId, sp.getStudentId(), currentRank,
                    sp.getTotalScore(), sp.getAccuracyPct()));
            previous = sp;
        }
        leaderboardRepo.saveAll(entries);
        log.info("Leaderboard generated for session {}: {} entries", sessionId, entries.size());
    }

    private void computeLearningObjectiveMastery(UUID sessionId, List<Map<String, Object>> interactions) {
        List<LearningObjectiveMastery> masteries = new ArrayList<>();

        Map<String, List<Map<String, Object>>> byObjective = interactions.stream()
                .filter(i -> i.get("learningObjective") != null)
                .filter(i -> "ANSWERED".equals(i.get("eventType")) || "TIMED_OUT".equals(i.get("eventType")))
                .collect(Collectors.groupingBy(
                        i -> (String) i.get("learningObjective")));

        for (Map.Entry<String, List<Map<String, Object>>> entry : byObjective.entrySet()) {
            String learningObjective = entry.getKey();
            List<Map<String, Object>> objInteractions = entry.getValue();

            Map<UUID, List<Map<String, Object>>> byStudent = objInteractions.stream()
                    .collect(Collectors.groupingBy(
                            i -> UUID.fromString((String) i.get("studentId"))));

            for (Map.Entry<UUID, List<Map<String, Object>>> studentEntry : byStudent.entrySet()) {
                UUID studentId = studentEntry.getKey();
                List<Map<String, Object>> studentInteractions = studentEntry.getValue();

                int attempted = 0;
                int correct = 0;
                for (Map<String, Object> interaction : studentInteractions) {
                    boolean isTimeout = Boolean.TRUE.equals(interaction.get("timeout"));
                    boolean isAnswered = Boolean.TRUE.equals(interaction.get("answered"));
                    if (isTimeout || !isAnswered) continue;
                    attempted++;
                    if (Boolean.TRUE.equals(interaction.get("isCorrect"))) correct++;
                }

                BigDecimal masteryPct = attempted > 0
                        ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(attempted), 4, RoundingMode.HALF_UP)
                            .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;

                masteries.add(new LearningObjectiveMastery(
                        sessionId, studentId, learningObjective, attempted, correct, masteryPct));
            }
        }

        List<LearningObjectiveMastery> existing = loRepo.findBySessionId(sessionId);
        if (!existing.isEmpty()) loRepo.deleteAll(existing);
        if (!masteries.isEmpty()) loRepo.saveAll(masteries);

        log.info("Learning objective mastery computed for session {}: {} entries", sessionId, masteries.size());
    }

    private void computeEngagementMetrics(UUID sessionId, List<Map<String, Object>> interactions) {
        List<EngagementMetrics> metricsList = new ArrayList<>();

        Map<UUID, List<Map<String, Object>>> byStudent = interactions.stream()
                .collect(Collectors.groupingBy(
                        i -> UUID.fromString((String) i.get("studentId"))));

        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byStudent.entrySet()) {
            UUID studentId = entry.getKey();
            List<Map<String, Object>> studentInteractions = entry.getValue();

            int totalDisplayed = (int) studentInteractions.stream()
                    .filter(i -> "DISPLAYED".equals(i.get("eventType")))
                    .count();
            int totalAnswered = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                    .count();
            int totalTimeout = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("timeout")))
                    .count();

            BigDecimal participationRate = totalDisplayed > 0
                    ? BigDecimal.valueOf(totalAnswered).divide(BigDecimal.valueOf(totalDisplayed), 4, RoundingMode.HALF_UP)
                        .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            BigDecimal timeoutRate = totalDisplayed > 0
                    ? BigDecimal.valueOf(totalTimeout).divide(BigDecimal.valueOf(totalDisplayed), 4, RoundingMode.HALF_UP)
                        .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            String responseTimeTrend = computeResponseTimeTrend(studentInteractions);

            String engagementLevel;
            if (participationRate.compareTo(BigDecimal.valueOf(80)) >= 0
                    && timeoutRate.compareTo(BigDecimal.valueOf(10)) < 0
                    && !"DECLINING".equals(responseTimeTrend)) {
                engagementLevel = "HIGH";
            } else if (participationRate.compareTo(BigDecimal.valueOf(50)) >= 0
                    && timeoutRate.compareTo(BigDecimal.valueOf(25)) < 0) {
                engagementLevel = "MEDIUM";
            } else {
                engagementLevel = "LOW";
            }

            metricsList.add(new EngagementMetrics(
                    sessionId, studentId, responseTimeTrend, timeoutRate,
                    participationRate, engagementLevel, totalAnswered, totalDisplayed));
        }

        List<EngagementMetrics> existing = engagementRepo.findBySessionId(sessionId);
        if (!existing.isEmpty()) engagementRepo.deleteAll(existing);
        if (!metricsList.isEmpty()) engagementRepo.saveAll(metricsList);

        long highCount = metricsList.stream().filter(m -> "HIGH".equals(m.getEngagementLevel())).count();
        log.info("Engagement metrics computed for session {}: {} students ({} HIGH)",
                sessionId, metricsList.size(), highCount);
    }

    private String computeResponseTimeTrend(List<Map<String, Object>> studentInteractions) {
        List<Map<String, Object>> answered = studentInteractions.stream()
                .filter(i -> Boolean.TRUE.equals(i.get("answered")) && getResponseTimeMs(i) != null)
                .sorted(Comparator.comparing(i -> {
                    Object ts = i.get("eventTimestamp");
                    if (ts instanceof String s) return s;
                    return "";
                }))
                .collect(Collectors.toList());

        if (answered.size() < 4) return "STABLE";

        int half = answered.size() / 2;
        double earlyAvg = answered.subList(0, half).stream()
                .mapToDouble(i -> getResponseTimeMs(i))
                .average().orElse(0);
        double lateAvg = answered.subList(half, answered.size()).stream()
                .mapToDouble(i -> getResponseTimeMs(i))
                .average().orElse(0);

        if (lateAvg < earlyAvg * 0.8) return "IMPROVING";
        if (lateAvg > earlyAvg * 1.2) return "DECLINING";
        return "STABLE";
    }

    private Long getResponseTimeMs(Map<String, Object> interaction) {
        Object rt = interaction.get("responseTimeMs");
        if (rt instanceof Number n) return n.longValue();
        if (rt instanceof String s) {
            try { return Long.parseLong(s); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }
}
