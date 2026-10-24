package com.spandan.transcription.application.service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentSkipListMap;

public class SessionBuffer {

    private final UUID sessionId;
    private final UUID streamId;
    private final ConcurrentSkipListMap<Integer, Segment> segments = new ConcurrentSkipListMap<>();
    private final int maxGapTolerance;
    private final long gapTimeoutMs;
    private int lastReceivedSequence = 0;
    private boolean gapDetected = false;
    private boolean completed = false;
    private Instant lastActivityAt;
    private Instant createdAt;

    public SessionBuffer(UUID sessionId, UUID streamId, int maxGapTolerance, long gapTimeoutMs) {
        this.sessionId = sessionId;
        this.streamId = streamId;
        this.maxGapTolerance = maxGapTolerance;
        this.gapTimeoutMs = gapTimeoutMs;
        this.createdAt = Instant.now();
        this.lastActivityAt = Instant.now();
    }

    public synchronized void addSegment(int sequenceNumber, String text, double confidence,
                                         boolean isFinal, long offsetMs, long durationMs, long timestamp) {
        lastActivityAt = Instant.now();
        Segment segment = new Segment(sequenceNumber, text, confidence, isFinal, offsetMs, durationMs, timestamp);
        segments.put(sequenceNumber, segment);

        if (sequenceNumber > lastReceivedSequence + 1) {
            int gapSize = sequenceNumber - lastReceivedSequence - 1;
            if (gapSize > maxGapTolerance) {
                gapDetected = true;
            }
        }
        lastReceivedSequence = Math.max(lastReceivedSequence, sequenceNumber);

        if (isFinal) {
            completed = true;
        }
    }

    public synchronized boolean isGapDetected() { return gapDetected; }
    public synchronized boolean isCompleted() { return completed; }
    public synchronized boolean isTimedOut() {
        return Instant.now().isAfter(lastActivityAt.plusMillis(gapTimeoutMs));
    }
    public synchronized Instant getCreatedAt() { return createdAt; }
    public synchronized int getLastReceivedSequence() { return lastReceivedSequence; }
    public synchronized UUID getSessionId() { return sessionId; }
    public synchronized UUID getStreamId() { return streamId; }

    public synchronized AssembledTranscript assemble() {
        StringBuilder fullText = new StringBuilder();
        long totalDurationMs = 0;
        int count = 0;
        for (Segment seg : segments.values()) {
            if (!fullText.isEmpty()) fullText.append(" ");
            fullText.append(seg.text);
            totalDurationMs = Math.max(totalDurationMs, seg.offsetMs + seg.durationMs);
            count++;
        }
        return new AssembledTranscript(fullText.toString(), count, totalDurationMs);
    }

    public record Segment(int sequenceNumber, String text, double confidence,
                          boolean isFinal, long offsetMs, long durationMs, long timestamp) {}
    public record AssembledTranscript(String text, int totalSegments, long totalDurationMs) {}
}
