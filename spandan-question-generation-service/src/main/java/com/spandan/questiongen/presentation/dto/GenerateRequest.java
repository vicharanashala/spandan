package com.spandan.questiongen.presentation.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class GenerateRequest {

    @NotNull
    private UUID sessionId;

    @NotNull
    private UUID transcriptId;

    @NotNull
    private UUID lectureId;

    private UUID sectionId;

    private UUID subsectionId;

    private String aiProvider;

    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getTranscriptId() { return transcriptId; }
    public void setTranscriptId(UUID transcriptId) { this.transcriptId = transcriptId; }
    public UUID getLectureId() { return lectureId; }
    public void setLectureId(UUID lectureId) { this.lectureId = lectureId; }
    public UUID getSectionId() { return sectionId; }
    public void setSectionId(UUID sectionId) { this.sectionId = sectionId; }
    public UUID getSubsectionId() { return subsectionId; }
    public void setSubsectionId(UUID subsectionId) { this.subsectionId = subsectionId; }
    public String getAiProvider() { return aiProvider; }
    public void setAiProvider(String aiProvider) { this.aiProvider = aiProvider; }
}
