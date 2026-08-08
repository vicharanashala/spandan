package com.spandan.reporting.infrastructure.persistence;

import com.spandan.reporting.domain.entity.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReportRepository extends JpaRepository<Report, UUID> {

    Optional<Report> findBySessionIdAndAnalyticsType(UUID sessionId, String analyticsType);

    List<Report> findBySessionId(UUID sessionId);

    List<Report> findByTeacherIdOrderByGeneratedAtDesc(UUID teacherId);

    boolean existsBySessionIdAndAnalyticsType(UUID sessionId, String analyticsType);
}
