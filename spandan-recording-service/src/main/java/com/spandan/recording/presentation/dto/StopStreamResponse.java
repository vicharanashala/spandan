package com.spandan.recording.presentation.dto;

import java.time.Instant;
import java.util.UUID;

public class StopStreamResponse {
    private final UUID sessionId;
    private final String status;
    private final long durationMs;
    private final int chunksSent;
    private final int chunksDropped;
    private final Instant stoppedAt;

    public StopStreamResponse(UUID sessionId, String status, long durationMs,
                              int chunksSent, int chunksDropped, Instant stoppedAt) {
        this.sessionId = sessionId;
        this.status = status;
        this.durationMs = durationMs;
        this.chunksSent = chunksSent;
        this.chunksDropped = chunksDropped;
        this.stoppedAt = stoppedAt;
    }

    public UUID getSessionId() { return sessionId; }
    public String getStatus() { return status; }
    public long getDurationMs() { return durationMs; }
    public int getChunksSent() { return chunksSent; }
    public int getChunksDropped() { return chunksDropped; }
    public Instant getStoppedAt() { return stoppedAt; }
}
