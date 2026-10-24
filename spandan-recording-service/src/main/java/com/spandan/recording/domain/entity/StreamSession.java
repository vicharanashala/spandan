package com.spandan.recording.domain.entity;

import com.spandan.recording.domain.enums.AudioFormat;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.enums.StreamStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stream_sessions")
public class StreamSession {

    @Id
    private UUID id;

    @Column(name = "session_id", nullable = false, unique = true)
    private UUID sessionId;

    @Column(name = "teacher_id", nullable = false)
    private UUID teacherId;

    @Column(name = "lecture_id")
    private UUID lectureId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private StreamStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "audio_format", nullable = false, length = 20)
    private AudioFormat audioFormat;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 50)
    private StreamProvider provider;

    @Column(name = "ws_endpoint")
    private String wsEndpoint;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "stopped_at")
    private Instant stoppedAt;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "chunks_sent", nullable = false)
    private int chunksSent;

    @Column(name = "chunks_dropped", nullable = false)
    private int chunksDropped;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public StreamSession() {}

    public StreamSession(UUID sessionId, UUID teacherId, UUID lectureId,
                         AudioFormat audioFormat, StreamProvider provider) {
        this.id = UUID.randomUUID();
        this.sessionId = sessionId;
        this.teacherId = teacherId;
        this.lectureId = lectureId;
        this.audioFormat = audioFormat;
        this.provider = provider;
        this.status = StreamStatus.PENDING;
        this.startedAt = Instant.now();
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
        this.chunksSent = 0;
        this.chunksDropped = 0;
    }

    public void transitionTo(StreamStatus target) {
        this.status = target;
        this.updatedAt = Instant.now();
        if (target == StreamStatus.STOPPED || target == StreamStatus.FAILED) {
            this.stoppedAt = Instant.now();
            this.durationMs = stoppedAt.toEpochMilli() - startedAt.toEpochMilli();
        }
    }

    public void incrementChunksSent() {
        this.chunksSent++;
        this.updatedAt = Instant.now();
    }

    public void incrementChunksDropped() {
        this.chunksDropped++;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public UUID getTeacherId() { return teacherId; }
    public UUID getLectureId() { return lectureId; }
    public StreamStatus getStatus() { return status; }
    public AudioFormat getAudioFormat() { return audioFormat; }
    public StreamProvider getProvider() { return provider; }
    public String getWsEndpoint() { return wsEndpoint; }
    public void setWsEndpoint(String wsEndpoint) { this.wsEndpoint = wsEndpoint; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getStoppedAt() { return stoppedAt; }
    public Long getDurationMs() { return durationMs; }
    public int getChunksSent() { return chunksSent; }
    public int getChunksDropped() { return chunksDropped; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
