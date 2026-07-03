package com.spandan.recording.domain.entity;

import java.util.UUID;

public class TranscriptSegment {
    private final String streamId;
    private final String sessionId;
    private final int sequenceNumber;
    private final String text;
    private final double confidence;
    private final boolean isFinal;
    private final long offsetMs;
    private final long durationMs;
    private final long timestamp;

    public TranscriptSegment(String streamId, String sessionId, int sequenceNumber,
                             String text, double confidence, boolean isFinal,
                             long offsetMs, long durationMs, long timestamp) {
        this.streamId = streamId;
        this.sessionId = sessionId;
        this.sequenceNumber = sequenceNumber;
        this.text = text;
        this.confidence = confidence;
        this.isFinal = isFinal;
        this.offsetMs = offsetMs;
        this.durationMs = durationMs;
        this.timestamp = timestamp;
    }

    public String getStreamId() { return streamId; }
    public String getSessionId() { return sessionId; }
    public int getSequenceNumber() { return sequenceNumber; }
    public String getText() { return text; }
    public double getConfidence() { return confidence; }
    public boolean isFinal() { return isFinal; }
    public long getOffsetMs() { return offsetMs; }
    public long getDurationMs() { return durationMs; }
    public long getTimestamp() { return timestamp; }
}
