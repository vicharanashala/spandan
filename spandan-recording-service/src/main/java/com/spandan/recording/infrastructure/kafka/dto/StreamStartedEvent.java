package com.spandan.recording.infrastructure.kafka.dto;

import java.time.Instant;

public class StreamStartedEvent {
    private String sessionId;
    private String teacherId;
    private String lectureId;
    private String audioFormat;
    private String provider;
    private String status;
    private String startedAt;

    public StreamStartedEvent() {}

    public StreamStartedEvent(String sessionId, String teacherId, String lectureId,
                              String audioFormat, String provider, String status, String startedAt) {
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.lectureId = lectureId;
        this.audioFormat = audioFormat;
        this.provider = provider;
        this.status = status;
        this.startedAt = startedAt;
    }

    public String getSessionId() { return sessionId; }
    public String getTeacherId() { return teacherId; }
    public String getLectureId() { return lectureId; }
    public String getAudioFormat() { return audioFormat; }
    public String getProvider() { return provider; }
    public String getStatus() { return status; }
    public String getStartedAt() { return startedAt; }
}
