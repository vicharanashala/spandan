package com.spandan.transcription.presentation.dto;

import com.spandan.transcription.domain.enums.ProcessingStatus;

import java.time.Instant;
import java.util.UUID;

public class TranscriptResponse {
    private UUID id;
    private UUID sessionId;
    private UUID streamId;
    private String transcriptText;
    private ProcessingStatus processingStatus;
    private Integer totalSegments;
    private Long totalDurationMs;
    private String failureReason;
    private Instant createdAt;
    private Instant expiryAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getStreamId() { return streamId; }
    public void setStreamId(UUID streamId) { this.streamId = streamId; }
    public String getTranscriptText() { return transcriptText; }
    public void setTranscriptText(String transcriptText) { this.transcriptText = transcriptText; }
    public ProcessingStatus getProcessingStatus() { return processingStatus; }
    public void setProcessingStatus(ProcessingStatus processingStatus) { this.processingStatus = processingStatus; }
    public Integer getTotalSegments() { return totalSegments; }
    public void setTotalSegments(Integer totalSegments) { this.totalSegments = totalSegments; }
    public Long getTotalDurationMs() { return totalDurationMs; }
    public void setTotalDurationMs(Long totalDurationMs) { this.totalDurationMs = totalDurationMs; }
    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiryAt() { return expiryAt; }
    public void setExpiryAt(Instant expiryAt) { this.expiryAt = expiryAt; }
}
