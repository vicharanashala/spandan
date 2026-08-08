package com.spandan.analytics.infrastructure.persistence.feature;

import com.spandan.analytics.domain.entity.feature.SessionFeatures;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SessionFeaturesRepository extends JpaRepository<SessionFeatures, UUID> {
    Optional<SessionFeatures> findBySessionId(UUID sessionId);
    void deleteBySessionId(UUID sessionId);
}
