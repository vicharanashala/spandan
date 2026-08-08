package com.spandan.recording.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class StartStreamRequest {
    @NotNull private UUID teacherId;
    private UUID lectureId;
    @NotNull private UUID sessionId;
    @NotBlank private String audioFormat;
    @NotBlank private String provider;
    @NotBlank private String providerEndpoint;

    public UUID getTeacherId() { return teacherId; }
    public void setTeacherId(UUID teacherId) { this.teacherId = teacherId; }
    public UUID getLectureId() { return lectureId; }
    public void setLectureId(UUID lectureId) { this.lectureId = lectureId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public String getAudioFormat() { return audioFormat; }
    public void setAudioFormat(String audioFormat) { this.audioFormat = audioFormat; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getProviderEndpoint() { return providerEndpoint; }
    public void setProviderEndpoint(String providerEndpoint) { this.providerEndpoint = providerEndpoint; }
}
