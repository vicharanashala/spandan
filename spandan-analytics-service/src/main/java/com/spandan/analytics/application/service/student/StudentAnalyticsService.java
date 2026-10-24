package com.spandan.analytics.application.service.student;

import com.spandan.analytics.domain.entity.LearningObjectiveMastery;
import com.spandan.analytics.domain.entity.StudentPerformance;
import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.domain.entity.historical.HistoricalConceptPerformance;
import com.spandan.analytics.domain.entity.historical.HistoricalStudentPerformance;
import com.spandan.analytics.infrastructure.persistence.LearningObjectiveMasteryRepository;
import com.spandan.analytics.infrastructure.persistence.StudentPerformanceJpaRepository;
import com.spandan.analytics.infrastructure.persistence.feature.EducationalFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.StudentFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalConceptPerformanceRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalStudentPerformanceRepository;
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
import java.util.stream.Collectors;

@Service
public class StudentAnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(StudentAnalyticsService.class);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final StudentPerformanceJpaRepository studentRepo;
    private final LearningObjectiveMasteryRepository loRepo;
    private final StudentFeaturesRepository studentFeaturesRepo;
    private final EducationalFeaturesRepository educationalFeaturesRepo;
    private final HistoricalStudentPerformanceRepository historicalStudentRepo;
    private final HistoricalConceptPerformanceRepository historicalConceptRepo;

    public StudentAnalyticsService(StudentPerformanceJpaRepository studentRepo,
                                    LearningObjectiveMasteryRepository loRepo,
                                    StudentFeaturesRepository studentFeaturesRepo,
                                    EducationalFeaturesRepository educationalFeaturesRepo,
                                    HistoricalStudentPerformanceRepository historicalStudentRepo,
                                    HistoricalConceptPerformanceRepository historicalConceptRepo) {
        this.studentRepo = studentRepo;
        this.loRepo = loRepo;
        this.studentFeaturesRepo = studentFeaturesRepo;
        this.educationalFeaturesRepo = educationalFeaturesRepo;
        this.historicalStudentRepo = historicalStudentRepo;
        this.historicalConceptRepo = historicalConceptRepo;
    }

    @Transactional
    public void computeStudentAnalytics(UUID sessionId) {
        List<StudentFeatures> studentFeatures = studentFeaturesRepo.findBySessionId(sessionId);
        List<EducationalFeatures> educationalFeatures = educationalFeaturesRepo.findBySessionId(sessionId);

        computeAndPersistStudentPerformance(sessionId, studentFeatures);
        computeAndPersistLearningObjectives(sessionId, educationalFeatures);

        log.info("Student analytics computed for session {}: {} students", sessionId, studentFeatures.size());
    }

    void computeAndPersistStudentPerformance(UUID sessionId, List<StudentFeatures> features) {
        List<StudentPerformance> existing = studentRepo.findByQuizId(sessionId);
        if (!existing.isEmpty()) studentRepo.deleteAll(existing);

        List<StudentPerformance> performances = features.stream()
                .map(sf -> {
                    int answered = sf.getTotalAnswered();
                    int correct = sf.getTotalCorrect();
                    int incorrect = sf.getTotalIncorrect();
                    int skipped = sf.getTotalQuestionsDisplayed() - sf.getTotalAnswered();
                    if (skipped < 0) skipped = 0;

                    BigDecimal totalScore = BigDecimal.valueOf(correct);
                    BigDecimal avgRtSeconds = BigDecimal.valueOf(sf.getAverageResponseTimeMs())
                            .divide(BigDecimal.valueOf(1000), 2, RoundingMode.HALF_UP);

                    return new StudentPerformance(sessionId, sf.getStudentId(), answered,
                            correct, incorrect, skipped, sf.getAccuracy(),
                            totalScore, avgRtSeconds);
                })
                .collect(Collectors.toList());

        if (!performances.isEmpty()) studentRepo.saveAll(performances);
    }

    void computeAndPersistLearningObjectives(UUID sessionId, List<EducationalFeatures> features) {
        List<LearningObjectiveMastery> existing = loRepo.findBySessionId(sessionId);
        if (!existing.isEmpty()) loRepo.deleteAll(existing);

        List<EducationalFeatures> loFeatures = features.stream()
                .filter(f -> "LEARNING_OBJECTIVE".equals(f.getEducationalLevel()))
                .collect(Collectors.toList());

        List<LearningObjectiveMastery> masteries = loFeatures.stream()
                .map(f -> new LearningObjectiveMastery(sessionId, f.getStudentId(),
                        f.getEducationalId() != null ? f.getEducationalId() : "",
                        f.getQuestionsAttempted(), f.getQuestionsCorrect(), f.getAccuracy()))
                .collect(Collectors.toList());

        if (!masteries.isEmpty()) loRepo.saveAll(masteries);
    }

    public List<StudentPerformance> getStudentPerformance(UUID sessionId) {
        return studentRepo.findByQuizId(sessionId);
    }

    public StudentPerformance getStudentPerformance(UUID sessionId, UUID studentId) {
        return studentRepo.findByQuizIdAndStudentId(sessionId, studentId).orElse(null);
    }

    public List<LearningObjectiveMastery> getLearningObjectives(UUID sessionId) {
        return loRepo.findBySessionId(sessionId);
    }

    public List<LearningObjectiveMastery> getStudentLearningObjectives(UUID sessionId, UUID studentId) {
        return loRepo.findBySessionIdAndStudentId(sessionId, studentId);
    }

    public List<Map.Entry<String, BigDecimal>> getWeakConcepts(UUID sessionId, UUID studentId) {
        List<EducationalFeatures> features = educationalFeaturesRepo.findBySessionIdAndStudentId(sessionId, studentId);
        return features.stream()
                .filter(f -> "CONCEPT".equals(f.getEducationalLevel()))
                .sorted(Comparator.comparing(EducationalFeatures::getAccuracy))
                .limit(5)
                .map(f -> Map.entry(f.getEducationalId() != null ? f.getEducationalId() : "unknown", f.getAccuracy()))
                .collect(Collectors.toList());
    }

    public List<Map.Entry<String, BigDecimal>> getStrongConcepts(UUID sessionId, UUID studentId) {
        List<EducationalFeatures> features = educationalFeaturesRepo.findBySessionIdAndStudentId(sessionId, studentId);
        return features.stream()
                .filter(f -> "CONCEPT".equals(f.getEducationalLevel()))
                .sorted(Comparator.comparing(EducationalFeatures::getAccuracy).reversed())
                .limit(5)
                .map(f -> Map.entry(f.getEducationalId() != null ? f.getEducationalId() : "unknown", f.getAccuracy()))
                .collect(Collectors.toList());
    }

    public HistoricalStudentPerformance getHistoricalPerformance(UUID studentId) {
        return historicalStudentRepo.findByStudentId(studentId).orElse(null);
    }

    public List<HistoricalConceptPerformance> getHistoricalConceptPerformance(UUID studentId) {
        return historicalConceptRepo.findByStudentId(studentId);
    }
}
