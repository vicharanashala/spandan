package com.spandan.analytics.presentation.controller;

import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.SessionFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.domain.entity.historical.HistoricalConceptPerformance;
import com.spandan.analytics.domain.entity.historical.HistoricalStudentPerformance;
import com.spandan.analytics.domain.exception.AnalyticsException;
import com.spandan.analytics.infrastructure.persistence.*;
import com.spandan.analytics.infrastructure.persistence.feature.EducationalFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.SessionFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.feature.StudentFeaturesRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalConceptPerformanceRepository;
import com.spandan.analytics.infrastructure.persistence.historical.HistoricalStudentPerformanceRepository;
import com.spandan.analytics.presentation.dto.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final SessionAnalyticsJpaRepository sessionRepo;
    private final QuestionAnalyticsJpaRepository questionRepo;
    private final StudentPerformanceJpaRepository studentRepo;
    private final LeaderboardEntryJpaRepository leaderboardRepo;
    private final LearningObjectiveMasteryRepository loRepo;
    private final EngagementMetricsRepository engagementRepo;
    private final StudentFeaturesRepository studentFeaturesRepo;
    private final EducationalFeaturesRepository educationalFeaturesRepo;
    private final SessionFeaturesRepository sessionFeaturesRepo;
    private final HistoricalStudentPerformanceRepository historicalStudentRepo;
    private final HistoricalConceptPerformanceRepository historicalConceptRepo;

    public AnalyticsController(SessionAnalyticsJpaRepository sessionRepo,
                                QuestionAnalyticsJpaRepository questionRepo,
                                StudentPerformanceJpaRepository studentRepo,
                                LeaderboardEntryJpaRepository leaderboardRepo,
                                LearningObjectiveMasteryRepository loRepo,
                                EngagementMetricsRepository engagementRepo,
                                StudentFeaturesRepository studentFeaturesRepo,
                                EducationalFeaturesRepository educationalFeaturesRepo,
                                SessionFeaturesRepository sessionFeaturesRepo,
                                HistoricalStudentPerformanceRepository historicalStudentRepo,
                                HistoricalConceptPerformanceRepository historicalConceptRepo) {
        this.sessionRepo = sessionRepo;
        this.questionRepo = questionRepo;
        this.studentRepo = studentRepo;
        this.leaderboardRepo = leaderboardRepo;
        this.loRepo = loRepo;
        this.engagementRepo = engagementRepo;
        this.studentFeaturesRepo = studentFeaturesRepo;
        this.educationalFeaturesRepo = educationalFeaturesRepo;
        this.sessionFeaturesRepo = sessionFeaturesRepo;
        this.historicalStudentRepo = historicalStudentRepo;
        this.historicalConceptRepo = historicalConceptRepo;
    }

    @GetMapping("/quiz/{quizId}/session")
    public ResponseEntity<SessionAnalyticsResponse> getSessionAnalytics(@PathVariable UUID quizId) {
        SessionAnalytics analytics = sessionRepo.findByQuizId(quizId)
                .orElseThrow(() -> AnalyticsException.notFound("Session analytics not found for quiz " + quizId));
        return ResponseEntity.ok(toSessionResponse(analytics));
    }

    @GetMapping("/session/{sessionId}/session")
    public ResponseEntity<SessionAnalyticsResponse> getSessionAnalyticsBySession(@PathVariable UUID sessionId) {
        SessionAnalytics analytics = sessionRepo.findByQuizId(sessionId)
                .orElseThrow(() -> AnalyticsException.notFound("Session analytics not found for " + sessionId));
        return ResponseEntity.ok(toSessionResponse(analytics));
    }

    @GetMapping("/quiz/{quizId}/questions")
    public ResponseEntity<List<QuestionAnalyticsResponse>> getQuestionAnalytics(@PathVariable UUID quizId) {
        List<QuestionAnalytics> analytics = questionRepo.findByQuizIdOrderByQuestionId(quizId);
        return ResponseEntity.ok(analytics.stream().map(this::toQuestionResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/questions")
    public ResponseEntity<List<QuestionAnalyticsResponse>> getQuestionAnalyticsBySession(@PathVariable UUID sessionId) {
        List<QuestionAnalytics> analytics = questionRepo.findByQuizIdOrderByQuestionId(sessionId);
        return ResponseEntity.ok(analytics.stream().map(this::toQuestionResponse).collect(Collectors.toList()));
    }

    @GetMapping("/quiz/{quizId}/students/me")
    public ResponseEntity<StudentPerformanceResponse> getMyPerformance(
            @PathVariable UUID quizId,
            @RequestHeader("X-User-Id") UUID userId) {
        StudentPerformance sp = studentRepo.findByQuizIdAndStudentId(quizId, userId)
                .orElseThrow(() -> AnalyticsException.notFound("Performance not found for student " + userId));
        return ResponseEntity.ok(toStudentResponse(sp));
    }

    @GetMapping("/session/{sessionId}/students/me")
    public ResponseEntity<StudentPerformanceResponse> getMyPerformanceBySession(
            @PathVariable UUID sessionId,
            @RequestHeader("X-User-Id") UUID userId) {
        StudentPerformance sp = studentRepo.findByQuizIdAndStudentId(sessionId, userId)
                .orElseThrow(() -> AnalyticsException.notFound("Performance not found for student " + userId));
        return ResponseEntity.ok(toStudentResponse(sp));
    }

    @GetMapping("/quiz/{quizId}/students")
    public ResponseEntity<List<StudentPerformanceResponse>> getAllStudentPerformance(@PathVariable UUID quizId) {
        List<StudentPerformance> students = studentRepo.findByQuizId(quizId);
        return ResponseEntity.ok(students.stream().map(this::toStudentResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/students")
    public ResponseEntity<List<StudentPerformanceResponse>> getAllStudentPerformanceBySession(
            @PathVariable UUID sessionId) {
        List<StudentPerformance> students = studentRepo.findByQuizId(sessionId);
        return ResponseEntity.ok(students.stream().map(this::toStudentResponse).collect(Collectors.toList()));
    }

    @GetMapping("/quiz/{quizId}/leaderboard")
    public ResponseEntity<List<LeaderboardEntryResponse>> getLeaderboard(@PathVariable UUID quizId) {
        List<LeaderboardEntry> entries = leaderboardRepo.findByQuizIdOrderByRankAsc(quizId);
        return ResponseEntity.ok(entries.stream().map(this::toLeaderboardResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/leaderboard")
    public ResponseEntity<List<LeaderboardEntryResponse>> getLeaderboardBySession(@PathVariable UUID sessionId) {
        List<LeaderboardEntry> entries = leaderboardRepo.findByQuizIdOrderByRankAsc(sessionId);
        return ResponseEntity.ok(entries.stream().map(this::toLeaderboardResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/learning-objectives")
    public ResponseEntity<List<LearningObjectiveMasteryResponse>> getLearningObjectives(
            @PathVariable UUID sessionId) {
        List<LearningObjectiveMastery> masteries = loRepo.findBySessionId(sessionId);
        return ResponseEntity.ok(masteries.stream().map(this::toLoResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/learning-objectives/student/{studentId}")
    public ResponseEntity<List<LearningObjectiveMasteryResponse>> getStudentLearningObjectives(
            @PathVariable UUID sessionId, @PathVariable UUID studentId) {
        List<LearningObjectiveMastery> masteries = loRepo.findBySessionIdAndStudentId(sessionId, studentId);
        return ResponseEntity.ok(masteries.stream().map(this::toLoResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/engagement")
    public ResponseEntity<List<EngagementMetricsResponse>> getEngagement(@PathVariable UUID sessionId) {
        List<EngagementMetrics> metrics = engagementRepo.findBySessionId(sessionId);
        return ResponseEntity.ok(metrics.stream().map(this::toEngagementResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/engagement/student/{studentId}")
    public ResponseEntity<EngagementMetricsResponse> getStudentEngagement(
            @PathVariable UUID sessionId, @PathVariable UUID studentId) {
        EngagementMetrics metrics = engagementRepo.findBySessionIdAndStudentId(sessionId, studentId)
                .orElseThrow(() -> AnalyticsException.notFound("Engagement not found for student " + studentId));
        return ResponseEntity.ok(toEngagementResponse(metrics));
    }

    @GetMapping("/session/{sessionId}/features/students")
    public ResponseEntity<List<StudentFeaturesResponse>> getStudentFeatures(@PathVariable UUID sessionId) {
        List<StudentFeatures> features = studentFeaturesRepo.findBySessionId(sessionId);
        return ResponseEntity.ok(features.stream().map(this::toStudentFeaturesResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/features/educational")
    public ResponseEntity<List<EducationalFeaturesResponse>> getEducationalFeatures(@PathVariable UUID sessionId) {
        List<EducationalFeatures> features = educationalFeaturesRepo.findBySessionId(sessionId);
        return ResponseEntity.ok(features.stream().map(this::toEducationalFeaturesResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/features/session")
    public ResponseEntity<SessionFeaturesResponse> getSessionFeatures(@PathVariable UUID sessionId) {
        SessionFeatures features = sessionFeaturesRepo.findBySessionId(sessionId)
                .orElseThrow(() -> AnalyticsException.notFound("Session features not found for " + sessionId));
        return ResponseEntity.ok(toSessionFeaturesResponse(features));
    }

    @GetMapping("/session/{sessionId}/classroom/accuracy")
    public ResponseEntity<ClassroomAnalyticsResponse> getClassroomAccuracy(@PathVariable UUID sessionId) {
        SessionAnalytics analytics = sessionRepo.findByQuizId(sessionId)
                .orElseThrow(() -> AnalyticsException.notFound("Session analytics not found for " + sessionId));
        ClassroomAnalyticsResponse resp = new ClassroomAnalyticsResponse();
        resp.setSessionId(sessionId);
        resp.setClassAccuracy(analytics.getOverallClassAccuracy());
        resp.setParticipationRate(analytics.getOverallParticipationRate());
        resp.setAverageResponseTimeSeconds(analytics.getAverageResponseTimeSeconds());
        resp.setTotalStudents(analytics.getTotalStudents());
        resp.setTotalQuestions(analytics.getTotalQuestions());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/session/{sessionId}/classroom/concepts")
    public ResponseEntity<ClassroomAnalyticsResponse> getClassroomConcepts(@PathVariable UUID sessionId) {
        List<EducationalFeatures> concepts = educationalFeaturesRepo
                .findBySessionIdAndEducationalLevel(sessionId, "CONCEPT");
        ClassroomAnalyticsResponse resp = new ClassroomAnalyticsResponse();
        resp.setSessionId(sessionId);
        resp.setDifficultConcepts(getDifficultConcepts(concepts));
        resp.setEasyConcepts(getEasyConcepts(concepts));
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/session/{sessionId}/classroom/learning-trend")
    public ResponseEntity<List<QuestionAnalyticsResponse>> getLearningTrend(@PathVariable UUID sessionId) {
        List<QuestionAnalytics> questions = questionRepo.findByQuizIdOrderByQuestionId(sessionId);
        return ResponseEntity.ok(questions.stream().map(this::toQuestionResponse).collect(Collectors.toList()));
    }

    @GetMapping("/session/{sessionId}/classroom/attention-required")
    public ResponseEntity<List<UUID>> getAttentionRequired(@PathVariable UUID sessionId) {
        List<EngagementMetrics> metrics = engagementRepo.findBySessionId(sessionId);
        List<UUID> attention = metrics.stream()
                .filter(m -> "LOW".equals(m.getEngagementLevel())
                        || m.getParticipationRate().compareTo(java.math.BigDecimal.valueOf(40)) < 0)
                .map(EngagementMetrics::getStudentId)
                .collect(Collectors.toList());
        return ResponseEntity.ok(attention);
    }

    @GetMapping("/student/{studentId}/history")
    public ResponseEntity<HistoricalPerformanceResponse> getStudentHistory(@PathVariable UUID studentId) {
        HistoricalStudentPerformance perf = historicalStudentRepo.findByStudentId(studentId)
                .orElseThrow(() -> AnalyticsException.notFound("History not found for student " + studentId));
        return ResponseEntity.ok(toHistoricalPerformanceResponse(perf));
    }

    @GetMapping("/student/{studentId}/history/concepts")
    public ResponseEntity<List<ConceptHistoryResponse>> getStudentConceptHistory(@PathVariable UUID studentId) {
        List<HistoricalConceptPerformance> concepts = historicalConceptRepo.findByStudentId(studentId);
        return ResponseEntity.ok(concepts.stream().map(this::toConceptHistoryResponse).collect(Collectors.toList()));
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("UP");
    }

    private SessionAnalyticsResponse toSessionResponse(SessionAnalytics a) {
        SessionAnalyticsResponse r = new SessionAnalyticsResponse();
        r.setQuizId(a.getQuizId());
        r.setTotalQuestions(a.getTotalQuestions());
        r.setTotalStudents(a.getTotalStudents());
        r.setOverallClassAccuracy(a.getOverallClassAccuracy());
        r.setOverallParticipationRate(a.getOverallParticipationRate());
        r.setAverageResponseTimeSeconds(a.getAverageResponseTimeSeconds());
        r.setGeneratedAt(a.getGeneratedAt());
        return r;
    }

    private QuestionAnalyticsResponse toQuestionResponse(QuestionAnalytics qa) {
        QuestionAnalyticsResponse r = new QuestionAnalyticsResponse();
        r.setQuestionId(qa.getQuestionId());
        r.setResponsesReceived(qa.getResponsesReceived());
        r.setCorrectCount(qa.getCorrectCount());
        r.setIncorrectCount(qa.getIncorrectCount());
        r.setSkippedCount(qa.getSkippedCount());
        r.setAccuracyPct(qa.getAccuracyPct());
        r.setAverageResponseTimeSeconds(qa.getAverageResponseTimeSeconds());
        r.setDifficultyScore(qa.getDifficultyScore());
        return r;
    }

    private StudentPerformanceResponse toStudentResponse(StudentPerformance sp) {
        StudentPerformanceResponse r = new StudentPerformanceResponse();
        r.setStudentId(sp.getStudentId());
        r.setTotalAnswered(sp.getTotalAnswered());
        r.setCorrectCount(sp.getCorrectCount());
        r.setIncorrectCount(sp.getIncorrectCount());
        r.setSkippedCount(sp.getSkippedCount());
        r.setAccuracyPct(sp.getAccuracyPct());
        r.setTotalScore(sp.getTotalScore());
        r.setAverageResponseTimeSeconds(sp.getAverageResponseTimeSeconds());
        return r;
    }

    private LeaderboardEntryResponse toLeaderboardResponse(LeaderboardEntry e) {
        LeaderboardEntryResponse r = new LeaderboardEntryResponse();
        r.setRank(e.getRank());
        r.setStudentId(e.getStudentId());
        r.setTotalScore(e.getTotalScore());
        r.setAccuracyPct(e.getAccuracyPct());
        return r;
    }

    private LearningObjectiveMasteryResponse toLoResponse(LearningObjectiveMastery lo) {
        LearningObjectiveMasteryResponse r = new LearningObjectiveMasteryResponse();
        r.setStudentId(lo.getStudentId());
        r.setLearningObjective(lo.getLearningObjective());
        r.setQuestionsAttempted(lo.getQuestionsAttempted());
        r.setQuestionsCorrect(lo.getQuestionsCorrect());
        r.setMasteryPct(lo.getMasteryPct());
        return r;
    }

    private EngagementMetricsResponse toEngagementResponse(EngagementMetrics em) {
        EngagementMetricsResponse r = new EngagementMetricsResponse();
        r.setStudentId(em.getStudentId());
        r.setResponseTimeTrend(em.getResponseTimeTrend());
        r.setTimeoutRate(em.getTimeoutRate());
        r.setParticipationRate(em.getParticipationRate());
        r.setEngagementLevel(em.getEngagementLevel());
        r.setTotalAnswered(em.getTotalAnswered());
        r.setTotalDisplayed(em.getTotalDisplayed());
        return r;
    }

    private StudentFeaturesResponse toStudentFeaturesResponse(StudentFeatures sf) {
        StudentFeaturesResponse r = new StudentFeaturesResponse();
        r.setStudentId(sf.getStudentId());
        r.setTotalQuestionsDisplayed(sf.getTotalQuestionsDisplayed());
        r.setTotalAnswered(sf.getTotalAnswered());
        r.setTotalCorrect(sf.getTotalCorrect());
        r.setTotalIncorrect(sf.getTotalIncorrect());
        r.setTotalTimedOut(sf.getTotalTimedOut());
        r.setParticipationRate(sf.getParticipationRate());
        r.setAccuracy(sf.getAccuracy());
        r.setAverageResponseTimeMs(sf.getAverageResponseTimeMs());
        r.setResponseTimeConsistency(sf.getResponseTimeConsistency());
        r.setTimeoutPercentage(sf.getTimeoutPercentage());
        return r;
    }

    private EducationalFeaturesResponse toEducationalFeaturesResponse(EducationalFeatures ef) {
        EducationalFeaturesResponse r = new EducationalFeaturesResponse();
        r.setStudentId(ef.getStudentId());
        r.setEducationalLevel(ef.getEducationalLevel());
        r.setEducationalId(ef.getEducationalId());
        r.setEducationalName(ef.getEducationalName());
        r.setQuestionsAttempted(ef.getQuestionsAttempted());
        r.setQuestionsCorrect(ef.getQuestionsCorrect());
        r.setAccuracy(ef.getAccuracy());
        r.setAverageResponseTimeMs(ef.getAverageResponseTimeMs());
        return r;
    }

    private SessionFeaturesResponse toSessionFeaturesResponse(SessionFeatures sf) {
        SessionFeaturesResponse r = new SessionFeaturesResponse();
        r.setSessionId(sf.getSessionId());
        r.setQuestionsAttempted(sf.getQuestionsAttempted());
        r.setQuestionsSkipped(sf.getQuestionsSkipped());
        r.setCompletionRate(sf.getCompletionRate());
        r.setTotalStudents(sf.getTotalStudents());
        r.setTotalInteractions(sf.getTotalInteractions());
        return r;
    }

    private HistoricalPerformanceResponse toHistoricalPerformanceResponse(HistoricalStudentPerformance hsp) {
        HistoricalPerformanceResponse r = new HistoricalPerformanceResponse();
        r.setStudentId(hsp.getStudentId());
        r.setTotalSessions(hsp.getTotalSessions());
        r.setAverageAccuracy(hsp.getAverageAccuracy());
        r.setAverageParticipationRate(hsp.getAverageParticipationRate());
        r.setAccuracyTrend(hsp.getAccuracyTrend());
        r.setParticipationTrend(hsp.getParticipationTrend());
        r.setAverageResponseTimeMs(hsp.getAverageResponseTimeMs());
        r.setLastSessionAccuracy(hsp.getLastSessionAccuracy());
        r.setLastSessionResponseTimeMs(hsp.getLastSessionResponseTimeMs());
        return r;
    }

    private ConceptHistoryResponse toConceptHistoryResponse(HistoricalConceptPerformance hcp) {
        ConceptHistoryResponse r = new ConceptHistoryResponse();
        r.setConceptId(hcp.getConceptId());
        r.setConceptName(hcp.getConceptName());
        r.setTotalAttempts(hcp.getTotalAttempts());
        r.setTotalCorrect(hcp.getTotalCorrect());
        r.setMasteryPct(hcp.getMasteryPct());
        r.setSessionsCovered(hcp.getSessionsCovered());
        r.setLastAccuracy(hcp.getLastAccuracy());
        return r;
    }

    private List<java.util.Map.Entry<String, java.math.BigDecimal>> getDifficultConcepts(
            List<EducationalFeatures> concepts) {
        return concepts.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        ef -> ef.getEducationalId() != null ? ef.getEducationalId() : "unknown",
                        java.util.stream.Collectors.averagingDouble(
                                ef -> ef.getAccuracy() != null ? ef.getAccuracy().doubleValue() : 0)))
                .entrySet().stream()
                .sorted(java.util.Map.Entry.comparingByValue())
                .limit(5)
                .map(e -> java.util.Map.entry(e.getKey(),
                        java.math.BigDecimal.valueOf(e.getValue()).setScale(2, java.math.RoundingMode.HALF_UP)))
                .collect(java.util.stream.Collectors.toList());
    }

    private List<java.util.Map.Entry<String, java.math.BigDecimal>> getEasyConcepts(
            List<EducationalFeatures> concepts) {
        return concepts.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        ef -> ef.getEducationalId() != null ? ef.getEducationalId() : "unknown",
                        java.util.stream.Collectors.averagingDouble(
                                ef -> ef.getAccuracy() != null ? ef.getAccuracy().doubleValue() : 0)))
                .entrySet().stream()
                .sorted(java.util.Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(5)
                .map(e -> java.util.Map.entry(e.getKey(),
                        java.math.BigDecimal.valueOf(e.getValue()).setScale(2, java.math.RoundingMode.HALF_UP)))
                .collect(java.util.stream.Collectors.toList());
    }
}
