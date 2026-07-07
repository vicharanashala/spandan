package com.spandan.analytics.infrastructure.persistence.feature;

import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EducationalFeaturesRepository extends JpaRepository<EducationalFeatures, UUID> {
    List<EducationalFeatures> findBySessionId(UUID sessionId);
    List<EducationalFeatures> findBySessionIdAndStudentId(UUID sessionId, UUID studentId);
    List<EducationalFeatures> findBySessionIdAndEducationalLevel(UUID sessionId, String educationalLevel);
    void deleteBySessionId(UUID sessionId);
}
