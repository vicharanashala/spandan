package com.spandan.transcription.infrastructure.persistence;

import com.spandan.transcription.domain.entity.Transcript;
import com.spandan.transcription.domain.enums.ProcessingStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TranscriptJpaRepository extends JpaRepository<Transcript, UUID> {
    Optional<Transcript> findBySessionId(UUID sessionId);
    List<Transcript> findByExpiryAtBeforeAndProcessingStatusNot(Instant expiry, ProcessingStatus status);
}
