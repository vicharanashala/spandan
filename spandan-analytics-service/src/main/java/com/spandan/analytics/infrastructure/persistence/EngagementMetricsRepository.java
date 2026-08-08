package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.EngagementMetrics;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EngagementMetricsRepository extends JpaRepository<EngagementMetrics, UUID> {

    List<EngagementMetrics> findBySessionId(UUID sessionId);

    Optional<EngagementMetrics> findBySessionIdAndStudentId(UUID sessionId, UUID studentId);
}
