package com.spandan.transcription.domain.entity;

import com.spandan.transcription.domain.enums.ProcessingStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "transcripts",
       uniqueConstraints = @UniqueConstraint(columnNames = {"session_id"}))
public class Transcript {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "stream_id", nullable = false)
    private UUID streamId;

    @Column(name = "transcript_text", columnDefinition = "TEXT")
    private String transcriptText;

    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status", nullable = false)
    private ProcessingStatus processingStatus;

    @Column(name = "total_segments")
    private Integer totalSegments;

    @Column(name = "total_duration_ms")
    private Long totalDurationMs;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expiry_at", nullable = false)
    private Instant expiryAt;

    public Transcript() {}

    public Transcript(UUID sessionId, UUID streamId) {
        this.sessionId = sessionId;
        this.streamId = streamId;
        this.processingStatus = ProcessingStatus.IN_PROGRESS;
        this.createdAt = Instant.now();
        this.expiryAt = createdAt.plusSeconds(18 * 3600);
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getStreamId() { return streamId; }
    public String getTranscriptText() { return transcriptText; }
    public ProcessingStatus getProcessingStatus() { return processingStatus; }
    public Integer getTotalSegments() { return totalSegments; }
    public Long getTotalDurationMs() { return totalDurationMs; }
    public String getFailureReason() { return failureReason; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiryAt() { return expiryAt; }

    public void markCompleted(String text, int totalSegments, long totalDurationMs) {
        this.transcriptText = text;
        this.totalSegments = totalSegments;
        this.totalDurationMs = totalDurationMs;
        this.processingStatus = ProcessingStatus.COMPLETED;
    }

    public void markFailed(String reason) {
        this.failureReason = reason;
        this.processingStatus = ProcessingStatus.FAILED;
    }

    public void markCancelled(String reason) {
        this.failureReason = reason;
        this.processingStatus = ProcessingStatus.CANCELLED;
    }
}
