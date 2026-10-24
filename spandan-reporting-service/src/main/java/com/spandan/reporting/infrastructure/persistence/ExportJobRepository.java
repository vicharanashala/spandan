package com.spandan.reporting.infrastructure.persistence;

import com.spandan.reporting.domain.entity.ExportJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExportJobRepository extends JpaRepository<ExportJob, UUID> {

    List<ExportJob> findBySessionId(UUID sessionId);

    Optional<ExportJob> findBySessionIdAndFormat(UUID sessionId, String format);

    List<ExportJob> findByStatus(String status);
}
