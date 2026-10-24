package com.spandan.recording.domain.port;

import com.spandan.recording.domain.entity.StreamSession;

public interface StreamLifecyclePublisher {
    void publishStarted(StreamSession session);
    void publishStopped(StreamSession session);
    void publishInterrupted(StreamSession session, String reason);
    void publishRecovered(StreamSession session);
    void publishFailed(StreamSession session, String reason);
}
