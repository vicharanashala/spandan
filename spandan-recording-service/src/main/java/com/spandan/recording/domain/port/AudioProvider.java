package com.spandan.recording.domain.port;

import com.spandan.recording.domain.entity.TranscriptSegment;
import java.io.Closeable;
import java.util.function.Consumer;

public interface AudioProvider extends Closeable {
    void connect(String endpoint, Consumer<TranscriptSegment> segmentHandler, Runnable onReady, Consumer<Throwable> onError);
    boolean isConnected();
    boolean sendAudio(byte[] data, int offset, int length);
    void disconnect();
}
