package com.spandan.recording.infrastructure.provider;

import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.port.AudioProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Consumer;

public class AssemblyAIAudioProvider implements AudioProvider {

    private static final Logger log = LoggerFactory.getLogger(AssemblyAIAudioProvider.class);

    @Override
    public void connect(String endpoint, Consumer<TranscriptSegment> segmentHandler,
                        Runnable onReady, Consumer<Throwable> onError) {
        log.info("AssemblyAI provider connect called (stub)");
        if (onReady != null) onReady.run();
    }

    @Override
    public boolean isConnected() { return true; }

    @Override
    public boolean sendAudio(byte[] data, int offset, int length) {
        return true;
    }

    @Override
    public void disconnect() {}

    @Override
    public void close() { disconnect(); }
}
