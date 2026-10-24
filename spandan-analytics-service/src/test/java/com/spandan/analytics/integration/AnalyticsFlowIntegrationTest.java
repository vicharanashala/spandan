package com.spandan.analytics.integration;

import com.spandan.analytics.application.service.AnalyticsComputationService;
import com.spandan.analytics.domain.entity.*;
import com.spandan.analytics.infrastructure.persistence.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Testcontainers
class AnalyticsFlowIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("analytics_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired
    private AnalyticsComputationService computationService;

    @Autowired
    private SessionAnalyticsJpaRepository sessionRepo;

    @Autowired
    private QuestionAnalyticsJpaRepository questionRepo;

    @Autowired
    private StudentPerformanceJpaRepository studentRepo;

    @Autowired
    private LeaderboardEntryJpaRepository leaderboardRepo;

    @Test
    void shouldGenerateAllAnalyticsFromResponses() {
        UUID quizId = UUID.randomUUID();
        UUID questionId = UUID.randomUUID();
        UUID student1 = UUID.randomUUID();
        UUID student2 = UUID.randomUUID();

        List<Map<String, Object>> responses = List.of(
            response(student1, questionId, "A", true, "ACCEPTED"),
            response(student2, questionId, "B", false, "ACCEPTED")
        );

        computationService.computeAnalytics(quizId, responses);

        assertTrue(sessionRepo.findByQuizId(quizId).isPresent());
        SessionAnalytics session = sessionRepo.findByQuizId(quizId).get();
        assertEquals(1, session.getTotalQuestions());
        assertEquals(2, session.getTotalStudents());

        List<QuestionAnalytics> questions = questionRepo.findByQuizIdOrderByQuestionId(quizId);
        assertEquals(1, questions.size());
        assertEquals(2, questions.get(0).getResponsesReceived());
        assertEquals(1, questions.get(0).getCorrectCount());

        List<StudentPerformance> students = studentRepo.findByQuizId(quizId);
        assertEquals(2, students.size());

        List<LeaderboardEntry> leaderboard = leaderboardRepo.findByQuizIdOrderByRankAsc(quizId);
        assertEquals(2, leaderboard.size());
        assertEquals(1, leaderboard.get(0).getRank());
    }

    @Test
    void shouldHandleConsecutiveRecomputationsIdempotently() {
        UUID quizId = UUID.randomUUID();
        UUID questionId = UUID.randomUUID();
        UUID studentId = UUID.randomUUID();

        List<Map<String, Object>> responses = List.of(
            response(studentId, questionId, "A", true, "ACCEPTED")
        );

        computationService.computeAnalytics(quizId, responses);
        computationService.computeAnalytics(quizId, responses);

        List<LeaderboardEntry> leaderboard = leaderboardRepo.findByQuizIdOrderByRankAsc(quizId);
        assertEquals(1, leaderboard.size());
        assertEquals(1, leaderboard.get(0).getRank());
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
