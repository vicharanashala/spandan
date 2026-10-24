package com.spandan.analytics.infrastructure.persistence.historical;

import com.spandan.analytics.domain.entity.historical.HistoricalStudentPerformance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface HistoricalStudentPerformanceRepository extends JpaRepository<HistoricalStudentPerformance, UUID> {
    Optional<HistoricalStudentPerformance> findByStudentId(UUID studentId);
}
