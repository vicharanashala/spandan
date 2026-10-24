package com.spandan.recording.infrastructure.persistence;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.StreamStatus;
import com.spandan.recording.domain.port.StreamSessionRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public class StreamSessionRepositoryAdapter implements StreamSessionRepository {

    private final JpaStreamSessionRepository jpa;

    public StreamSessionRepositoryAdapter(JpaStreamSessionRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public StreamSession save(StreamSession session) {
        return jpa.save(session);
    }

    @Override
    public Optional<StreamSession> findById(UUID id) {
        return jpa.findById(id);
    }

    @Override
    public Optional<StreamSession> findBySessionId(UUID sessionId) {
        return jpa.findBySessionId(sessionId);
    }

    @Override
    public boolean existsBySessionId(UUID sessionId) {
        return jpa.existsBySessionId(sessionId);
    }

    @Override
    public long countByStatus(StreamStatus status) {
        return jpa.countByStatus(status);
    }
}
