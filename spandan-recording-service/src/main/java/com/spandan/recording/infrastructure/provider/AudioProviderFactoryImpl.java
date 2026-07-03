package com.spandan.recording.infrastructure.provider;

import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.port.AudioProvider;
import com.spandan.recording.domain.port.AudioProviderFactory;
import org.springframework.stereotype.Component;

@Component
public class AudioProviderFactoryImpl implements AudioProviderFactory {

    private final String defaultSessionId = "pending";

    @Override
    public AudioProvider create(StreamProvider provider) {
        return switch (provider) {
            case DEEPGRAM -> new DeepgramAudioProvider(defaultSessionId);
            case ASSEMBLYAI -> new AssemblyAIAudioProvider();
            case WHISPER -> new WhisperAudioProvider();
        };
    }
}
