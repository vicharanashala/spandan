package com.spandan.recording.infrastructure.kafka.dto;

public class StreamRecoveredEvent {
    private String sessionId;
    private String teacherId;
    private String status;
    private String startedAt;
    private String recoveredAt;

    public StreamRecoveredEvent() {}

    public StreamRecoveredEvent(String sessionId, String teacherId, String status,
                                String startedAt, String recoveredAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.status = status;
        this.startedAt = startedAt;
        this.recoveredAt = recoveredAt;
    }

    public String getSessionId() { return sessionId; }
    public String getTeacherId() { return teacherId; }
    public String getStatus() { return status; }
    public String getStartedAt() { return startedAt; }
    public String getRecoveredAt() { return recoveredAt; }
}
