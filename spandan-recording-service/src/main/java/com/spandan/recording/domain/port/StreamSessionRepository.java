package com.spandan.recording.domain.port;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.StreamStatus;
import java.util.Optional;
import java.util.UUID;

public interface StreamSessionRepository {
    StreamSession save(StreamSession session);
    Optional<StreamSession> findById(UUID id);
    Optional<StreamSession> findBySessionId(UUID sessionId);
    boolean existsBySessionId(UUID sessionId);
    long countByStatus(StreamStatus status);
}
