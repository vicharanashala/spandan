package com.spandan.transcription.application.service;

import com.spandan.transcription.domain.entity.Transcript;
import com.spandan.transcription.domain.entity.TranscriptionAudit;
import com.spandan.transcription.domain.enums.ProcessingStatus;
import com.spandan.transcription.infrastructure.kafka.producers.TranscriptionEventProducer;
import com.spandan.transcription.infrastructure.persistence.TranscriptJpaRepository;
import com.spandan.transcription.infrastructure.persistence.TranscriptionAuditJpaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TranscriptionOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(TranscriptionOrchestrator.class);

    private final TranscriptJpaRepository transcriptRepo;
    private final TranscriptionAuditJpaRepository auditRepo;
    private final TranscriptionEventProducer eventProducer;
    private final ConcurrentHashMap<UUID, SessionBuffer> activeBuffers = new ConcurrentHashMap<>();
    private final int maxGapTolerance;
    private final long gapTimeoutMs;

    public TranscriptionOrchestrator(TranscriptJpaRepository transcriptRepo,
                                      TranscriptionAuditJpaRepository auditRepo,
                                      TranscriptionEventProducer eventProducer,
                                      @Value("${transcription.max-gap-tolerance}") int maxGapTolerance,
                                      @Value("${transcription.gap-timeout-ms}") long gapTimeoutMs) {
        this.transcriptRepo = transcriptRepo;
        this.auditRepo = auditRepo;
        this.eventProducer = eventProducer;
        this.maxGapTolerance = maxGapTolerance;
        this.gapTimeoutMs = gapTimeoutMs;
    }

    public SessionBuffer getOrCreateBuffer(UUID sessionId, UUID streamId) {
        return activeBuffers.computeIfAbsent(sessionId,
                id -> new SessionBuffer(sessionId, streamId, maxGapTolerance, gapTimeoutMs));
    }

    @Transactional
    public void handleSegmentReceived(UUID sessionId, UUID streamId, int sequenceNumber,
                                       String text, double confidence, boolean isFinal,
                                       long offsetMs, long durationMs, long timestamp) {
        SessionBuffer buffer = getOrCreateBuffer(sessionId, streamId);
        buffer.addSegment(sequenceNumber, text, confidence, isFinal, offsetMs, durationMs, timestamp);

        if (buffer.isGapDetected()) {
            String reason = "Gap detected at sequence " + sequenceNumber
                    + " (expected " + (buffer.getLastReceivedSequence() + 1) + ")";
            log.warn("{} for sessionId={}", reason, sessionId);
            failStream(sessionId, reason);
            return;
        }

        if (buffer.isCompleted()) {
            finalizeTranscript(sessionId, buffer);
        }
    }

    @Transactional
    public void finalizeTranscript(UUID sessionId, SessionBuffer buffer) {
        SessionBuffer.AssembledTranscript assembled = buffer.assemble();
        activeBuffers.remove(sessionId);

        Transcript transcript = transcriptRepo.findBySessionId(sessionId)
                .orElseGet(() -> new Transcript(sessionId, buffer.getStreamId()));

        transcript.markCompleted(assembled.text(), assembled.totalSegments(), assembled.totalDurationMs());
        transcriptRepo.save(transcript);

        eventProducer.publishTranscriptGenerated(
                transcript.getId(), sessionId, assembled.totalSegments(), assembled.totalDurationMs());

        TranscriptionAudit audit = new TranscriptionAudit(
                transcript.getId(), "rs-forwarded", assembled.totalSegments(), assembled.totalDurationMs());
        auditRepo.save(audit);

        log.info("Transcript completed for sessionId={}, {} segments, {}ms",
                sessionId, assembled.totalSegments(), assembled.totalDurationMs());
    }

    @Transactional
    public void failStream(UUID sessionId, String reason) {
        activeBuffers.remove(sessionId);
        SessionBuffer buffer = activeBuffers.get(sessionId);
        if (buffer != null) {
            activeBuffers.remove(sessionId);
        }

        Transcript transcript = transcriptRepo.findBySessionId(sessionId)
                .orElse(null);
        if (transcript != null) {
            transcript.markFailed(reason);
            transcriptRepo.save(transcript);
        }

        eventProducer.publishTranscriptGenerationFailed(sessionId, reason);
        log.warn("Stream failed for sessionId={}: {}", sessionId, reason);
    }

    @Transactional
    public void handleStreamInterrupted(UUID sessionId) {
        failStream(sessionId, "Stream interrupted");
    }

    public void expireTranscripts() {
        Instant cutoff = Instant.now();
        List<Transcript> expired = transcriptRepo.findByExpiryAtBeforeAndProcessingStatusNot(cutoff, ProcessingStatus.COMPLETED);
        for (Transcript t : expired) {
            transcriptRepo.delete(t);
            eventProducer.publishTranscriptDeleted(t.getId(), t.getSessionId(), "EXPIRED");
        }
        if (!expired.isEmpty()) {
            log.info("Expired {} transcripts via sweep", expired.size());
        }
    }

    public void sweepStaleBuffers() {
        List<UUID> stale = activeBuffers.entrySet().stream()
                .filter(e -> e.getValue().isTimedOut())
                .map(e -> e.getKey())
                .toList();
        for (UUID sessionId : stale) {
            failStream(sessionId, "Buffer timed out");
        }
        if (!stale.isEmpty()) {
            log.info("Cleaned {} stale session buffers", stale.size());
        }
    }
}
