package com.spandan.recording.presentation.dto;

import java.time.Instant;
import java.util.UUID;

public class StartStreamResponse {
    private final UUID id;
    private final UUID sessionId;
    private final String status;
    private final String provider;
    private final Instant startedAt;

    public StartStreamResponse(UUID id, UUID sessionId, String status,
                               String provider, Instant startedAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.status = status;
        this.provider = provider;
        this.startedAt = startedAt;
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public String getStatus() { return status; }
    public String getProvider() { return provider; }
    public Instant getStartedAt() { return startedAt; }
}
