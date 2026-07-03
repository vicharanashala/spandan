package com.spandan.recording.infrastructure.grpc;

import com.spandan.recording.domain.port.TranscriptForwarder;
import com.spandan.recording.domain.port.TranscriptForwarderFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TranscriptForwarderFactoryImpl implements TranscriptForwarderFactory {

    private final String tsHost;
    private final int tsPort;

    public TranscriptForwarderFactoryImpl(
            @Value("${grpc.client.transcription-service.host:localhost}") String tsHost,
            @Value("${grpc.client.transcription-service.port:9091}") int tsPort) {
        this.tsHost = tsHost;
        this.tsPort = tsPort;
    }

    @Override
    public TranscriptForwarder create(String streamId) {
        GrpcTranscriptForwarder forwarder = new GrpcTranscriptForwarder(tsHost, tsPort, streamId);
        forwarder.connect();
        return forwarder;
    }
}
