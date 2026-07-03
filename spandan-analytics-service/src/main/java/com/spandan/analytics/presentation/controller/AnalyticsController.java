package com.spandan.analytics.presentation.controller;

import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.domain.exception.AnalyticsException;
import com.spandan.analytics.infrastructure.persistence.*;
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

    public AnalyticsController(SessionAnalyticsJpaRepository sessionRepo,
                               QuestionAnalyticsJpaRepository questionRepo,
                               StudentPerformanceJpaRepository studentRepo,
                               LeaderboardEntryJpaRepository leaderboardRepo) {
        this.sessionRepo = sessionRepo;
        this.questionRepo = questionRepo;
        this.studentRepo = studentRepo;
        this.leaderboardRepo = leaderboardRepo;
    }

    @GetMapping("/quiz/{quizId}/session")
    public ResponseEntity<SessionAnalyticsResponse> getSessionAnalytics(@PathVariable UUID quizId) {
        SessionAnalytics analytics = sessionRepo.findByQuizId(quizId)
                .orElseThrow(() -> AnalyticsException.notFound("Session analytics not found for quiz " + quizId));
        SessionAnalyticsResponse resp = new SessionAnalyticsResponse();
        resp.setQuizId(analytics.getQuizId());
        resp.setTotalQuestions(analytics.getTotalQuestions());
        resp.setTotalStudents(analytics.getTotalStudents());
        resp.setOverallClassAccuracy(analytics.getOverallClassAccuracy());
        resp.setOverallParticipationRate(analytics.getOverallParticipationRate());
        resp.setAverageResponseTimeSeconds(analytics.getAverageResponseTimeSeconds());
        resp.setGeneratedAt(analytics.getGeneratedAt());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/quiz/{quizId}/questions")
    public ResponseEntity<List<QuestionAnalyticsResponse>> getQuestionAnalytics(@PathVariable UUID quizId) {
        List<QuestionAnalytics> analytics = questionRepo.findByQuizIdOrderByQuestionId(quizId);
        List<QuestionAnalyticsResponse> resp = analytics.stream().map(qa -> {
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
        }).collect(Collectors.toList());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/quiz/{quizId}/students/me")
    public ResponseEntity<StudentPerformanceResponse> getMyPerformance(
            @PathVariable UUID quizId,
            @RequestHeader("X-User-Id") UUID userId) {
        StudentPerformance sp = studentRepo.findByQuizIdAndStudentId(quizId, userId)
                .orElseThrow(() -> AnalyticsException.notFound("Performance not found for student " + userId));
        return ResponseEntity.ok(toStudentResponse(sp));
    }

    @GetMapping("/quiz/{quizId}/students")
    public ResponseEntity<List<StudentPerformanceResponse>> getAllStudentPerformance(@PathVariable UUID quizId) {
        List<StudentPerformance> students = studentRepo.findByQuizId(quizId);
        List<StudentPerformanceResponse> resp = students.stream()
                .map(this::toStudentResponse)
                .collect(Collectors.toList());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/quiz/{quizId}/leaderboard")
    public ResponseEntity<List<LeaderboardEntryResponse>> getLeaderboard(@PathVariable UUID quizId) {
        List<LeaderboardEntry> entries = leaderboardRepo.findByQuizIdOrderByRankAsc(quizId);
        List<LeaderboardEntryResponse> resp = entries.stream().map(e -> {
            LeaderboardEntryResponse r = new LeaderboardEntryResponse();
            r.setRank(e.getRank());
            r.setStudentId(e.getStudentId());
            r.setTotalScore(e.getTotalScore());
            r.setAccuracyPct(e.getAccuracyPct());
            return r;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("UP");
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
}
