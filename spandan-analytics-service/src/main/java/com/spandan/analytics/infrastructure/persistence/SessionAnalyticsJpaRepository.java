package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.SessionAnalytics;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SessionAnalyticsJpaRepository extends JpaRepository<SessionAnalytics, UUID> {
    Optional<SessionAnalytics> findByQuizId(UUID quizId);
    boolean existsByQuizId(UUID quizId);
}
