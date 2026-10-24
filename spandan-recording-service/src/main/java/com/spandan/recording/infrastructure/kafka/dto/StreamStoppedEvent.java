package com.spandan.recording.infrastructure.kafka.dto;

public class StreamStoppedEvent {
    private String sessionId;
    private String teacherId;
    private String status;
    private String startedAt;
    private Long durationMs;
    private int chunksSent;
    private int chunksDropped;
    private String stoppedAt;

    public StreamStoppedEvent() {}

    public StreamStoppedEvent(String sessionId, String teacherId, String status, String startedAt,
                              Long durationMs, int chunksSent, int chunksDropped, String stoppedAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.status = status;
        this.startedAt = startedAt;
        this.durationMs = durationMs;
        this.chunksSent = chunksSent;
        this.chunksDropped = chunksDropped;
        this.stoppedAt = stoppedAt;
    }

    public String getSessionId() { return sessionId; }
    public String getTeacherId() { return teacherId; }
    public String getStatus() { return status; }
    public String getStartedAt() { return startedAt; }
    public Long getDurationMs() { return durationMs; }
    public int getChunksSent() { return chunksSent; }
    public int getChunksDropped() { return chunksDropped; }
    public String getStoppedAt() { return stoppedAt; }
}
