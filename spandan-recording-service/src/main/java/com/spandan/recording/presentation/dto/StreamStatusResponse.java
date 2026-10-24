package com.spandan.recording.presentation.dto;

import java.time.Instant;
import java.util.UUID;

public class StreamStatusResponse {
    private final UUID sessionId;
    private final String status;
    private final String provider;
    private final boolean active;
    private final Instant startedAt;
    private final Instant stoppedAt;
    private final Long durationMs;
    private final int chunksSent;
    private final int chunksDropped;
    private final String errorMessage;

    public StreamStatusResponse(UUID sessionId, String status, String provider,
                                boolean active, Instant startedAt, Instant stoppedAt,
                                Long durationMs, int chunksSent, int chunksDropped,
                                String errorMessage) {
        this.sessionId = sessionId;
        this.status = status;
        this.provider = provider;
        this.active = active;
        this.startedAt = startedAt;
        this.stoppedAt = stoppedAt;
        this.durationMs = durationMs;
        this.chunksSent = chunksSent;
        this.chunksDropped = chunksDropped;
        this.errorMessage = errorMessage;
    }

    public UUID getSessionId() { return sessionId; }
    public String getStatus() { return status; }
    public String getProvider() { return provider; }
    public boolean isActive() { return active; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getStoppedAt() { return stoppedAt; }
    public Long getDurationMs() { return durationMs; }
    public int getChunksSent() { return chunksSent; }
    public int getChunksDropped() { return chunksDropped; }
    public String getErrorMessage() { return errorMessage; }
}
