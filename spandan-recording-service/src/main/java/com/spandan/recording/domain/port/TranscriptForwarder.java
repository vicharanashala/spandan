package com.spandan.recording.domain.port;

import com.spandan.recording.domain.entity.TranscriptSegment;
import java.io.Closeable;

public interface TranscriptForwarder extends Closeable {
    void sendSegment(TranscriptSegment segment);
    boolean isConnected();
}
