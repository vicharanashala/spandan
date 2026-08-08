package com.spandan.analytics.application.service;

import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.infrastructure.persistence.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AnalyticsComputationServiceTest {

    @Mock private SessionAnalyticsJpaRepository sessionRepo;
    @Mock private QuestionAnalyticsJpaRepository questionRepo;
    @Mock private StudentPerformanceJpaRepository studentRepo;
    @Mock private LeaderboardEntryJpaRepository leaderboardRepo;
    @Mock private LearningObjectiveMasteryRepository loRepo;
    @Mock private EngagementMetricsRepository engagementRepo;
    @Captor private ArgumentCaptor<List<LeaderboardEntry>> leaderboardCaptor;

    private AnalyticsComputationService service;
    private UUID quizId;

    @BeforeEach
    void setUp() {
        service = new AnalyticsComputationService(sessionRepo, questionRepo, studentRepo,
                leaderboardRepo, loRepo, engagementRepo);
        quizId = UUID.randomUUID();
    }

    @Test
    void shouldComputeCorrectAnalytics() {
        UUID q1 = UUID.randomUUID();
        UUID q2 = UUID.randomUUID();
        UUID s1 = UUID.randomUUID();
        UUID s2 = UUID.randomUUID();

        List<Map<String, Object>> responses = List.of(
            response(s1, q1, "A", true, "ACCEPTED"),
            response(s2, q1, "B", false, "ACCEPTED"),
            response(s1, q2, "C", true, "ACCEPTED"),
            response(s2, q2, "D", true, "ACCEPTED")
        );

        when(questionRepo.findByQuizIdOrderByQuestionId(quizId)).thenReturn(List.of());
        when(studentRepo.findByQuizId(quizId)).thenReturn(List.of());
        when(sessionRepo.findByQuizId(quizId)).thenReturn(Optional.empty());

        service.computeAnalytics(quizId, responses);

        verify(questionRepo).saveAll(any());
        verify(studentRepo).saveAll(any());
        verify(sessionRepo).save(any());
        verify(leaderboardRepo).deleteByQuizId(quizId);
        verify(leaderboardRepo).saveAll(leaderboardCaptor.capture());

        List<LeaderboardEntry> entries = leaderboardCaptor.getValue();
        assertEquals(2, entries.size());
        assertEquals(1, entries.get(0).getRank());
        assertEquals(2, entries.get(1).getRank());
    }

    @Test
    void shouldHandleEmptyResponses() {
        when(questionRepo.findByQuizIdOrderByQuestionId(quizId)).thenReturn(List.of());
        when(studentRepo.findByQuizId(quizId)).thenReturn(List.of());
        when(sessionRepo.findByQuizId(quizId)).thenReturn(Optional.empty());

        service.computeAnalytics(quizId, List.of());

        verify(questionRepo).saveAll(any());
        verify(studentRepo).saveAll(any());
        verify(sessionRepo).save(any());
        verify(leaderboardRepo).saveAll(any());
    }

    @Test
    void shouldHandleDuplicateRejectedResponses() {
        UUID q1 = UUID.randomUUID();
        UUID s1 = UUID.randomUUID();

        List<Map<String, Object>> responses = List.of(
            response(s1, q1, "A", true, "ACCEPTED"),
            response(s1, q1, "B", false, "REJECTED_DUPLICATE")
        );

        when(questionRepo.findByQuizIdOrderByQuestionId(quizId)).thenReturn(List.of());
        when(studentRepo.findByQuizId(quizId)).thenReturn(List.of());
        when(sessionRepo.findByQuizId(quizId)).thenReturn(Optional.empty());

        service.computeAnalytics(quizId, responses);

        verify(questionRepo).saveAll(any());
        verify(studentRepo).saveAll(any());
        verify(leaderboardRepo).saveAll(leaderboardCaptor.capture());

        List<LeaderboardEntry> entries = leaderboardCaptor.getValue();
        assertEquals(1, entries.size());
    }

    @Test
    void shouldApplyTieBreakingCorrectly() {
        UUID q1 = UUID.randomUUID();
        UUID s1 = UUID.randomUUID();
        UUID s2 = UUID.randomUUID();
        UUID s3 = UUID.randomUUID();

        List<Map<String, Object>> responses = List.of(
            response(s1, q1, "A", true, "ACCEPTED"),
            response(s2, q1, "A", true, "ACCEPTED"),
            response(s3, q1, "B", false, "ACCEPTED")
        );

        when(questionRepo.findByQuizIdOrderByQuestionId(quizId)).thenReturn(List.of());
        when(studentRepo.findByQuizId(quizId)).thenReturn(List.of());
        when(sessionRepo.findByQuizId(quizId)).thenReturn(Optional.empty());

        service.computeAnalytics(quizId, responses);

        verify(leaderboardRepo).saveAll(leaderboardCaptor.capture());
        List<LeaderboardEntry> entries = leaderboardCaptor.getValue();

        assertEquals(3, entries.size());
        assertEquals(1, entries.get(0).getRank());
        assertEquals(2, entries.get(1).getRank());
        assertEquals(3, entries.get(2).getRank());
    }

    private Map<String, Object> response(UUID studentId, UUID questionId, String option,
                                          boolean correct, String status) {
        Map<String, Object> r = new HashMap<>();
        r.put("studentId", studentId.toString());
        r.put("questionId", questionId.toString());
        r.put("selectedOption", option);
        r.put("isCorrect", correct);
        r.put("submissionStatus", status);
        r.put("responseTimestamp", "2026-07-02T18:00:00Z");
        return r;
    }
}
