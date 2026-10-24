package com.spandan.analytics.infrastructure.persistence.historical;

import com.spandan.analytics.domain.entity.historical.HistoricalConceptPerformance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HistoricalConceptPerformanceRepository extends JpaRepository<HistoricalConceptPerformance, UUID> {
    List<HistoricalConceptPerformance> findByStudentId(UUID studentId);
    Optional<HistoricalConceptPerformance> findByStudentIdAndConceptId(UUID studentId, String conceptId);
}
