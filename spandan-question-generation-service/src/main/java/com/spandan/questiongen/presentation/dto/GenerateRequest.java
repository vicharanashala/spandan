package com.spandan.questiongen.presentation.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class GenerateRequest {

    @NotNull
    private UUID sessionId;

    @NotNull
    private UUID transcriptId;

    private String aiProvider;

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getTranscriptId() { return transcriptId; }
    public void setTranscriptId(UUID transcriptId) { this.transcriptId = transcriptId; }
    public String getAiProvider() { return aiProvider; }
    public void setAiProvider(String aiProvider) { this.aiProvider = aiProvider; }
}
