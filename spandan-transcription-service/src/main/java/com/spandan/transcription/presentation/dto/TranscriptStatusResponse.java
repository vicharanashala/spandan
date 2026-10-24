package com.spandan.transcription.presentation.dto;

import com.spandan.transcription.domain.enums.ProcessingStatus;

public class TranscriptStatusResponse {
    private ProcessingStatus processingStatus;
    private Integer totalSegments;
    private Long totalDurationMs;
    private String failureReason;

    public ProcessingStatus getProcessingStatus() { return processingStatus; }
    public void setProcessingStatus(ProcessingStatus processingStatus) { this.processingStatus = processingStatus; }
    public Integer getTotalSegments() { return totalSegments; }
    public void setTotalSegments(Integer totalSegments) { this.totalSegments = totalSegments; }
    public Long getTotalDurationMs() { return totalDurationMs; }
    public void setTotalDurationMs(Long totalDurationMs) { this.totalDurationMs = totalDurationMs; }
    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
}
