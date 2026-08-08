package com.spandan.recording.infrastructure.kafka.dto;

public class StreamInterruptedEvent {
    private String sessionId;
    private String teacherId;
    private String status;
    private String startedAt;
    private String reason;
    private String interruptedAt;

    public StreamInterruptedEvent() {}

    public StreamInterruptedEvent(String sessionId, String teacherId, String status,
                                  String startedAt, String reason, String interruptedAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.status = status;
        this.startedAt = startedAt;
        this.reason = reason;
        this.interruptedAt = interruptedAt;
    }

    public String getSessionId() { return sessionId; }
    public String getTeacherId() { return teacherId; }
    public String getStatus() { return status; }
    public String getStartedAt() { return startedAt; }
    public String getReason() { return reason; }
    public String getInterruptedAt() { return interruptedAt; }
}
