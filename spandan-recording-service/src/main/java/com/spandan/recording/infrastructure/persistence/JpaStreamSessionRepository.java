package com.spandan.recording.infrastructure.persistence;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.StreamStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface JpaStreamSessionRepository extends JpaRepository<StreamSession, UUID> {

    Optional<StreamSession> findBySessionId(UUID sessionId);

    boolean existsBySessionId(UUID sessionId);

    long countByStatus(StreamStatus status);
}
