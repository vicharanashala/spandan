package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.QuestionAnalytics;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface QuestionAnalyticsJpaRepository extends JpaRepository<QuestionAnalytics, UUID> {
    List<QuestionAnalytics> findByQuizIdOrderByQuestionId(UUID quizId);
}
