package com.spandan.recording.domain.port;

public interface TranscriptForwarderFactory {
    TranscriptForwarder create(String streamId);
}
