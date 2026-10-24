package com.spandan.recording.domain.port;

import com.spandan.recording.domain.enums.StreamProvider;

public interface AudioProviderFactory {
    AudioProvider create(StreamProvider provider);
}
