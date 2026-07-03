package com.spandan.analytics.application.service;

import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.infrastructure.persistence.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

    public AnalyticsComputationService(SessionAnalyticsJpaRepository sessionRepo,
                                       QuestionAnalyticsJpaRepository questionRepo,
                                       StudentPerformanceJpaRepository studentRepo,
                                       LeaderboardEntryJpaRepository leaderboardRepo) {
        this.sessionRepo = sessionRepo;
        this.questionRepo = questionRepo;
        this.studentRepo = studentRepo;
        this.leaderboardRepo = leaderboardRepo;
    }

    @Transactional
    public void computeAnalytics(UUID quizId, List<Map<String, Object>> responses) {
        Map<UUID, List<Map<String, Object>>> byQuestion = responses.stream()
                .collect(Collectors.groupingBy(r -> UUID.fromString((String) r.get("questionId"))));

        List<QuestionAnalytics> questionAnalyticsList = new ArrayList<>();
        int totalCorrect = 0;
        int totalResponses = 0;
        double totalResponseTime = 0;
        int responseTimeCount = 0;

        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byQuestion.entrySet()) {
            UUID questionId = entry.getKey();
            List<Map<String, Object>> questionResponses = entry.getValue();

            int correct = 0;
            int incorrect = 0;
            int skipped = 0;
            double sumResponseTime = 0;
            int rtCount = 0;
            Set<String> answeringStudents = new HashSet<>();

            for (Map<String, Object> r : questionResponses) {
                String status = (String) r.get("submissionStatus");
                if (!"ACCEPTED".equals(status)) {
                    skipped++;
                    continue;
                }
                answeringStudents.add((String) r.get("studentId"));
                boolean isCorrect = Boolean.TRUE.equals(r.get("isCorrect"));
                if (isCorrect) correct++;
                else incorrect++;

                Object rt = r.get("responseTimestamp");
                if (rt != null) {
                    sumResponseTime += parseResponseTime(r);
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
            BigDecimal avgRt = rtCount > 0
                    ? BigDecimal.valueOf(sumResponseTime / rtCount).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            int totalForQuestion = questionResponses.size();
            BigDecimal skipRate = totalForQuestion > 0
                    ? BigDecimal.valueOf(skipped).divide(BigDecimal.valueOf(totalForQuestion), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            double rawDifficulty = W1 * (1 - accuracy.doubleValue() / 100.0)
                    + W2 * Math.min(avgRt.doubleValue() / 60.0, 1.0)
                    + W3 * skipRate.doubleValue();
            BigDecimal difficulty = BigDecimal.valueOf(rawDifficulty * 100)
                    .setScale(2, RoundingMode.HALF_UP);

            if (rtCount > 0) {
                totalResponseTime += sumResponseTime;
                responseTimeCount += rtCount;
            }

            questionAnalyticsList.add(new QuestionAnalytics(
                    quizId, questionId, received, correct, incorrect, skipped,
                    accuracy, avgRt, difficulty));
        }

        questionRepo.deleteAll(questionRepo.findByQuizIdOrderByQuestionId(quizId));
        questionRepo.saveAll(questionAnalyticsList);

        Map<UUID, List<Map<String, Object>>> byStudent = responses.stream()
                .collect(Collectors.groupingBy(r -> UUID.fromString((String) r.get("studentId"))));

        List<StudentPerformance> performances = new ArrayList<>();
        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byStudent.entrySet()) {
            UUID studentId = entry.getKey();
            List<Map<String, Object>> studentResponses = entry.getValue();

            int correct = 0;
            int incorrect = 0;
            int skipped = 0;
            double sumRt = 0;
            int rtCount = 0;

            for (Map<String, Object> r : studentResponses) {
                String status = (String) r.get("submissionStatus");
                if (!"ACCEPTED".equals(status)) {
                    skipped++;
                    continue;
                }
                boolean isCorrect = Boolean.TRUE.equals(r.get("isCorrect"));
                if (isCorrect) correct++;
                else incorrect++;

                Object rt = r.get("responseTimestamp");
                if (rt != null) {
                    sumRt += parseResponseTime(r);
                    rtCount++;
                }
            }

            int answered = correct + incorrect;
            BigDecimal accuracy = answered > 0
                    ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(answered), 4, RoundingMode.HALF_UP)
                        .multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal avgRt = rtCount > 0
                    ? BigDecimal.valueOf(sumRt / rtCount).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal totalScore = BigDecimal.valueOf(correct);

            performances.add(new StudentPerformance(
                    quizId, studentId, answered, correct, incorrect, skipped,
                    accuracy, totalScore, avgRt));
        }

        studentRepo.deleteAll(studentRepo.findByQuizId(quizId));
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
                ? BigDecimal.valueOf(totalResponseTime / responseTimeCount).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        sessionRepo.findByQuizId(quizId).ifPresentOrElse(
                existing -> {},
                () -> sessionRepo.save(new SessionAnalytics(
                        quizId, totalQuestions, totalStudents, classAccuracy,
                        participationRate, classAvgRt)));

        generateLeaderboard(quizId, performances);

        log.info("Analytics computed for quiz {}: {} questions, {} students", quizId, totalQuestions, totalStudents);
    }

    @Transactional
    public void generateLeaderboard(UUID quizId, List<StudentPerformance> performances) {
        leaderboardRepo.deleteByQuizId(quizId);

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
                    quizId, sp.getStudentId(), currentRank,
                    sp.getTotalScore(), sp.getAccuracyPct()));
            previous = sp;
        }

        leaderboardRepo.saveAll(entries);
        log.info("Leaderboard generated for quiz {}: {} entries", quizId, entries.size());
    }

    private double parseResponseTime(Map<String, Object> response) {
        try {
            Object ts = response.get("responseTimestamp");
            if (ts instanceof String s) {
                return 0;
            }
        } catch (Exception e) {
            return 0;
        }
        return 0;
    }
}
