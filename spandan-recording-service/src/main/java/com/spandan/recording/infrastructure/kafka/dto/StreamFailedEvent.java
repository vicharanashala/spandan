package com.spandan.recording.infrastructure.kafka.dto;

public class StreamFailedEvent {
    private String sessionId;
    private String teacherId;
    private String status;
    private String startedAt;
    private String reason;
    private String failedAt;

    public StreamFailedEvent() {}

    public StreamFailedEvent(String sessionId, String teacherId, String status,
                             String startedAt, String reason, String failedAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.status = status;
        this.startedAt = startedAt;
        this.reason = reason;
        this.failedAt = failedAt;
    }

    public String getSessionId() { return sessionId; }
    public String getTeacherId() { return teacherId; }
    public String getStatus() { return status; }
    public String getStartedAt() { return startedAt; }
    public String getReason() { return reason; }
    public String getFailedAt() { return failedAt; }
}
