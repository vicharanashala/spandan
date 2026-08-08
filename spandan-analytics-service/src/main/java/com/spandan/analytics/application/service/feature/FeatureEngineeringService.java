package com.spandan.analytics.application.service.feature;

import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.SessionFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.domain.entity.historical.HistoricalConceptPerformance;
import com.spandan.analytics.domain.entity.historical.HistoricalStudentPerformance;
import com.spandan.analytics.infrastructure.persistence.feature.EducationalFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.SessionFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.StudentFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalConceptPerformanceRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalStudentPerformanceRepository;
import com.spandan.analytics.infrastructure.rest.ResponseServiceRestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FeatureEngineeringService {

    private static final Logger log = LoggerFactory.getLogger(FeatureEngineeringService.class);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final ResponseServiceRestClient responseClient;
    private final StudentFeaturesRepository studentFeaturesRepo;
    private final EducationalFeaturesRepository educationalFeaturesRepo;
    private final SessionFeaturesRepository sessionFeaturesRepo;
    private final HistoricalStudentPerformanceRepository historicalStudentRepo;
    private final HistoricalConceptPerformanceRepository historicalConceptRepo;

    public FeatureEngineeringService(ResponseServiceRestClient responseClient,
                                      StudentFeaturesRepository studentFeaturesRepo,
                                      EducationalFeaturesRepository educationalFeaturesRepo,
                                      SessionFeaturesRepository sessionFeaturesRepo,
                                      HistoricalStudentPerformanceRepository historicalStudentRepo,
                                      HistoricalConceptPerformanceRepository historicalConceptRepo) {
        this.responseClient = responseClient;
        this.studentFeaturesRepo = studentFeaturesRepo;
        this.educationalFeaturesRepo = educationalFeaturesRepo;
        this.sessionFeaturesRepo = sessionFeaturesRepo;
        this.historicalStudentRepo = historicalStudentRepo;
        this.historicalConceptRepo = historicalConceptRepo;
    }

    @Transactional
    public FeatureEngineeringResult computeFeatures(UUID sessionId) {
        List<Map<String, Object>> interactions = responseClient.fetchSessionResponses(sessionId);
        if (interactions == null || interactions.isEmpty()) {
            log.warn("No interactions for sessionId={}, computing empty features", sessionId);
            return new FeatureEngineeringResult(List.of(), List.of(), null, List.of(), List.of());
        }
        return computeFeaturesFromInteractions(sessionId, interactions);
    }

    @Transactional
    public FeatureEngineeringResult computeFeaturesFromInteractions(UUID sessionId, List<Map<String, Object>> interactions) {
        studentFeaturesRepo.deleteBySessionId(sessionId);
        educationalFeaturesRepo.deleteBySessionId(sessionId);
        sessionFeaturesRepo.deleteBySessionId(sessionId);

        List<StudentFeatures> studentFeatures = computeStudentFeatures(sessionId, interactions);
        List<EducationalFeatures> educationalFeatures = computeEducationalFeatures(sessionId, interactions);
        SessionFeatures sessionFeatures = computeSessionFeatures(sessionId, interactions);
        List<HistoricalStudentPerformance> historicalStudents = updateHistoricalStudentPerformance(studentFeatures);
        List<HistoricalConceptPerformance> historicalConcepts = updateHistoricalConceptPerformance(sessionId, interactions);

        if (!studentFeatures.isEmpty()) studentFeaturesRepo.saveAll(studentFeatures);
        if (!educationalFeatures.isEmpty()) educationalFeaturesRepo.saveAll(educationalFeatures);
        if (sessionFeatures != null) sessionFeaturesRepo.save(sessionFeatures);

        log.info("Feature engineering complete for sessionId={}: {} students, {} educational features",
                sessionId, studentFeatures.size(), educationalFeatures.size());

        return new FeatureEngineeringResult(studentFeatures, educationalFeatures, sessionFeatures,
                historicalStudents, historicalConcepts);
    }

    List<StudentFeatures> computeStudentFeatures(UUID sessionId, List<Map<String, Object>> interactions) {
        Map<UUID, List<Map<String, Object>>> byStudent = interactions.stream()
                .collect(Collectors.groupingBy(
                        i -> UUID.fromString((String) i.get("studentId"))));

        List<StudentFeatures> features = new ArrayList<>();

        for (Map.Entry<UUID, List<Map<String, Object>>> entry : byStudent.entrySet()) {
            UUID studentId = entry.getKey();
            List<Map<String, Object>> studentInteractions = entry.getValue();

            int totalDisplayed = (int) studentInteractions.stream()
                    .filter(i -> "DISPLAYED".equals(i.get("eventType")) || i.get("answered") != null || i.get("timeout") != null)
                    .count();
            int totalAnswered = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                    .count();
            int totalCorrect = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("isCorrect")))
                    .count();
            int totalIncorrect = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("answered")) && !Boolean.TRUE.equals(i.get("isCorrect")))
                    .count();
            int totalTimedOut = (int) studentInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("timeout")))
                    .count();

            BigDecimal participationRate = totalDisplayed > 0
                    ? BigDecimal.valueOf(totalAnswered).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(totalDisplayed), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            BigDecimal accuracy = (totalCorrect + totalIncorrect) > 0
                    ? BigDecimal.valueOf(totalCorrect).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(totalCorrect + totalIncorrect), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            List<Long> responseTimes = studentInteractions.stream()
                    .filter(i -> i.get("responseTimeMs") != null)
                    .map(i -> {
                        Object rt = i.get("responseTimeMs");
                        if (rt instanceof Number n) return n.longValue();
                        return 0L;
                    })
                    .collect(Collectors.toList());

            long avgRtMs = responseTimes.isEmpty() ? 0 :
                    (long) responseTimes.stream().mapToLong(Long::longValue).average().orElse(0);

            BigDecimal rtConsistency = BigDecimal.ZERO;
            if (responseTimes.size() > 1) {
                double mean = responseTimes.stream().mapToLong(Long::longValue).average().orElse(0);
                if (mean > 0) {
                    double variance = responseTimes.stream()
                            .mapToDouble(rt -> Math.pow(rt - mean, 2))
                            .average().orElse(0);
                    double stdDev = Math.sqrt(variance);
                    rtConsistency = BigDecimal.valueOf(stdDev / mean * 100)
                            .setScale(2, RoundingMode.HALF_UP);
                }
            }

            BigDecimal timeoutPct = totalDisplayed > 0
                    ? BigDecimal.valueOf(totalTimedOut).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(totalDisplayed), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            features.add(new StudentFeatures(sessionId, studentId, totalDisplayed,
                    totalAnswered, totalCorrect, totalIncorrect, totalTimedOut,
                    participationRate, accuracy, avgRtMs, rtConsistency, timeoutPct));
        }

        return features;
    }

    List<EducationalFeatures> computeEducationalFeatures(UUID sessionId, List<Map<String, Object>> interactions) {
        List<EducationalFeatures> features = new ArrayList<>();
        String[] levels = {"sectionId", "subsectionId", "topicId", "conceptId", "learningObjective"};

        for (String level : levels) {
            Map<String, List<Map<String, Object>>> byLevel = interactions.stream()
                    .filter(i -> i.get(level) != null)
                    .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                    .collect(Collectors.groupingBy(
                            i -> (String) i.get(level)));

            for (Map.Entry<String, List<Map<String, Object>>> entry : byLevel.entrySet()) {
                String levelId = entry.getKey();
                List<Map<String, Object>> levelInteractions = entry.getValue();

                Map<UUID, List<Map<String, Object>>> byStudent = levelInteractions.stream()
                        .collect(Collectors.groupingBy(
                                i -> UUID.fromString((String) i.get("studentId"))));

                for (Map.Entry<UUID, List<Map<String, Object>>> studentEntry : byStudent.entrySet()) {
                    UUID studentId = studentEntry.getKey();
                    List<Map<String, Object>> studentInteractions = studentEntry.getValue();

                    int attempted = studentInteractions.size();
                    int correct = (int) studentInteractions.stream()
                            .filter(i -> Boolean.TRUE.equals(i.get("isCorrect")))
                            .count();

                    BigDecimal accuracy = attempted > 0
                            ? BigDecimal.valueOf(correct).multiply(HUNDRED)
                                    .divide(BigDecimal.valueOf(attempted), 2, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;

                    double avgRt = studentInteractions.stream()
                            .filter(i -> i.get("responseTimeMs") != null)
                            .mapToLong(i -> {
                                Object rt = i.get("responseTimeMs");
                                if (rt instanceof Number n) return n.longValue();
                                return 0L;
                            })
                            .average().orElse(0);

                    features.add(new EducationalFeatures(
                            sessionId, studentId, level.toUpperCase().replace("Id", "").toUpperCase(),
                            levelId, null, attempted, correct, accuracy, (long) avgRt));
                }
            }
        }

        return features;
    }

    SessionFeatures computeSessionFeatures(UUID sessionId, List<Map<String, Object>> interactions) {
        long uniqueQuestions = interactions.stream()
                .map(i -> (String) i.get("questionId"))
                .distinct().count();
        long uniqueStudents = interactions.stream()
                .map(i -> (String) i.get("studentId"))
                .distinct().count();
        long answered = interactions.stream()
                .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                .count();
        long total = interactions.stream()
                .filter(i -> "DISPLAYED".equals(i.get("eventType")) || i.get("answered") != null || i.get("timeout") != null)
                .count();
        long skipped = total - answered;

        BigDecimal completionRate = total > 0
                ? BigDecimal.valueOf(answered).multiply(HUNDRED)
                        .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        return new SessionFeatures(sessionId, (int) answered, (int) Math.max(0, skipped),
                completionRate, (int) uniqueStudents, interactions.size());
    }

    private List<HistoricalStudentPerformance> updateHistoricalStudentPerformance(List<StudentFeatures> studentFeatures) {
        List<HistoricalStudentPerformance> updated = new ArrayList<>();

        for (StudentFeatures sf : studentFeatures) {
            UUID studentId = sf.getStudentId();
            Optional<HistoricalStudentPerformance> existing = historicalStudentRepo.findByStudentId(studentId);

            HistoricalStudentPerformance hsp;
            if (existing.isPresent()) {
                hsp = existing.get();
                int totalSessions = hsp.getTotalSessions() + 1;
                BigDecimal avgAcc = hsp.getAverageAccuracy()
                        .multiply(BigDecimal.valueOf(hsp.getTotalSessions()))
                        .add(sf.getAccuracy())
                        .divide(BigDecimal.valueOf(totalSessions), 2, RoundingMode.HALF_UP);
                BigDecimal avgPart = hsp.getAverageParticipationRate()
                        .multiply(BigDecimal.valueOf(hsp.getTotalSessions()))
                        .add(sf.getParticipationRate())
                        .divide(BigDecimal.valueOf(totalSessions), 2, RoundingMode.HALF_UP);
                long avgRt = (hsp.getAverageResponseTimeMs() * hsp.getTotalSessions()
                        + sf.getAverageResponseTimeMs()) / totalSessions;

                String accTrend = computeTrend(hsp.getLastSessionAccuracy(), sf.getAccuracy());
                String partTrend = computeTrend(
                        BigDecimal.valueOf(hsp.getAverageParticipationRate().doubleValue()),
                        sf.getParticipationRate());

                hsp.setTotalSessions(totalSessions);
                hsp.setAverageAccuracy(avgAcc);
                hsp.setAverageParticipationRate(avgPart);
                hsp.setAccuracyTrend(accTrend);
                hsp.setParticipationTrend(partTrend);
                hsp.setAverageResponseTimeMs(avgRt);
                hsp.setLastSessionAccuracy(sf.getAccuracy());
                hsp.setLastSessionResponseTimeMs(sf.getAverageResponseTimeMs());
                hsp.setUpdatedAt(java.time.Instant.now());
            } else {
                hsp = new HistoricalStudentPerformance(studentId, 1, sf.getAccuracy(),
                        sf.getParticipationRate(), "STABLE", "STABLE",
                        sf.getAverageResponseTimeMs(), sf.getAccuracy(), sf.getAverageResponseTimeMs());
            }

            historicalStudentRepo.save(hsp);
            updated.add(hsp);
        }

        return updated;
    }

    private List<HistoricalConceptPerformance> updateHistoricalConceptPerformance(UUID sessionId,
            List<Map<String, Object>> interactions) {
        List<HistoricalConceptPerformance> updated = new ArrayList<>();

        Map<String, List<Map<String, Object>>> byConceptAndStudent = interactions.stream()
                .filter(i -> i.get("conceptId") != null)
                .filter(i -> Boolean.TRUE.equals(i.get("answered")))
                .collect(Collectors.groupingBy(
                        i -> (String) i.get("conceptId") + "|" + (String) i.get("studentId")));

        for (Map.Entry<String, List<Map<String, Object>>> entry : byConceptAndStudent.entrySet()) {
            String[] parts = entry.getKey().split("\\|");
            if (parts.length != 2) continue;
            String conceptId = parts[0];
            UUID studentId = UUID.fromString(parts[1]);
            List<Map<String, Object>> conceptInteractions = entry.getValue();

            String conceptName = conceptInteractions.stream()
                    .findFirst()
                    .map(i -> (String) i.get("conceptName"))
                    .orElse(null);

            int totalAttempts = conceptInteractions.size();
            int totalCorrect = (int) conceptInteractions.stream()
                    .filter(i -> Boolean.TRUE.equals(i.get("isCorrect")))
                    .count();
            BigDecimal accuracy = totalAttempts > 0
                    ? BigDecimal.valueOf(totalCorrect).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(totalAttempts), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            Optional<HistoricalConceptPerformance> existing = historicalConceptRepo
                    .findByStudentIdAndConceptId(studentId, conceptId);

            HistoricalConceptPerformance hcp;
            if (existing.isPresent()) {
                hcp = existing.get();
                int newAttempts = hcp.getTotalAttempts() + totalAttempts;
                int newCorrect = hcp.getTotalCorrect() + totalCorrect;
                BigDecimal mastery = newAttempts > 0
                        ? BigDecimal.valueOf(newCorrect).multiply(HUNDRED)
                                .divide(BigDecimal.valueOf(newAttempts), 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
                hcp.setTotalAttempts(newAttempts);
                hcp.setTotalCorrect(newCorrect);
                hcp.setMasteryPct(mastery);
                hcp.setSessionsCovered(hcp.getSessionsCovered() + 1);
                hcp.setLastAccuracy(accuracy);
                hcp.setUpdatedAt(java.time.Instant.now());
            } else {
                hcp = new HistoricalConceptPerformance(studentId, conceptId, conceptName,
                        totalAttempts, totalCorrect, accuracy, 1, accuracy);
            }

            historicalConceptRepo.save(hcp);
            updated.add(hcp);
        }

        return updated;
    }

    private String computeTrend(BigDecimal previous, BigDecimal current) {
        double diff = current.doubleValue() - previous.doubleValue();
        if (diff > 5) return "IMPROVING";
        if (diff < -5) return "DECLINING";
        return "STABLE";
    }

    public record FeatureEngineeringResult(
            List<StudentFeatures> studentFeatures,
            List<EducationalFeatures> educationalFeatures,
            SessionFeatures sessionFeatures,
            List<HistoricalStudentPerformance> historicalStudents,
            List<HistoricalConceptPerformance> historicalConcepts) {}
}
