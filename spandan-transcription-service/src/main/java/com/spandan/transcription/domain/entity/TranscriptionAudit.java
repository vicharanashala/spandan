package com.spandan.transcription.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "transcription_audit")
public class TranscriptionAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID auditId;

    @Column(name = "transcript_id", nullable = false)
    private UUID transcriptId;

    @Column(name = "provider", nullable = false)
    private String provider;

    @Column(name = "total_segments")
    private Integer totalSegments;

    @Column(name = "total_duration_ms")
    private Long totalDurationMs;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    public TranscriptionAudit() {}

    public TranscriptionAudit(UUID transcriptId, String provider, Integer totalSegments, Long totalDurationMs) {
        this.transcriptId = transcriptId;
        this.provider = provider;
        this.totalSegments = totalSegments;
        this.totalDurationMs = totalDurationMs;
        this.timestamp = Instant.now();
    }

    public UUID getAuditId() { return auditId; }
    public UUID getTranscriptId() { return transcriptId; }
    public String getProvider() { return provider; }
    public Integer getTotalSegments() { return totalSegments; }
    public Long getTotalDurationMs() { return totalDurationMs; }
    public Instant getTimestamp() { return timestamp; }
}
