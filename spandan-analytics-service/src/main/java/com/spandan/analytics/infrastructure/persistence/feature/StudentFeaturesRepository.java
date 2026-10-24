package com.spandan.analytics.infrastructure.persistence.feature;

import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StudentFeaturesRepository extends JpaRepository<StudentFeatures, UUID> {
    List<StudentFeatures> findBySessionId(UUID sessionId);
    Optional<StudentFeatures> findBySessionIdAndStudentId(UUID sessionId, UUID studentId);
    void deleteBySessionId(UUID sessionId);
}
