package com.spandan.recording.infrastructure.grpc;

import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.port.TranscriptForwarder;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class GrpcTranscriptForwarder implements TranscriptForwarder {

    private static final Logger log = LoggerFactory.getLogger(GrpcTranscriptForwarder.class);

    private final ManagedChannel channel;
    private final TranscriptIngestionGrpc.TranscriptIngestionStub asyncStub;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private volatile StreamObserver<TranscriptSegmentRequest> requestObserver;
    private final String streamId;

    public GrpcTranscriptForwarder(String host, int port, String streamId) {
        this.streamId = streamId;
        this.channel = ManagedChannelBuilder.forAddress(host, port)
                .usePlaintext()
                .keepAliveTime(30, TimeUnit.SECONDS)
                .keepAliveTimeout(10, TimeUnit.SECONDS)
                .keepAliveWithoutCalls(true)
                .build();
        this.asyncStub = TranscriptIngestionGrpc.newStub(channel);
        log.info("gRPC forwarder created (not connected): streamId={}, target={}:{}", streamId, host, port);
    }

    public boolean connect() {
        try {
            StreamObserver<TranscriptIngestionAck> responseObserver = new StreamObserver<>() {
                @Override
                public void onNext(TranscriptIngestionAck ack) {
                    if (!ack.getAccepted()) {
                        log.warn("TS rejected segment: streamId={}, seq={}, reason={}",
                                ack.getStreamId(), ack.getLastReceivedSequence(), ack.getErrorMessage());
                    }
                }

                @Override
                public void onError(Throwable t) {
                    connected.set(false);
                    log.error("gRPC stream error from TS: streamId={}", streamId, t);
                }

                @Override
                public void onCompleted() {
                    connected.set(false);
                    log.info("gRPC stream completed by TS: streamId={}", streamId);
                }
            };

            this.requestObserver = asyncStub.streamTranscript(responseObserver);
            this.connected.set(true);
            log.info("gRPC forwarder connected: streamId={}", streamId);
            return true;
        } catch (Exception e) {
            log.error("Failed to establish gRPC stream to TS: streamId={}", streamId, e);
            this.connected.set(false);
            return false;
        }
    }

    @Override
    public void sendSegment(TranscriptSegment segment) {
        if (!connected.get()) {
            log.warn("Cannot send segment, gRPC not connected: streamId={}", streamId);
            return;
        }

        TranscriptSegmentRequest request = TranscriptSegmentRequest.newBuilder()
                .setStreamId(streamId)
                .setSessionId(segment.getSessionId())
                .setSequenceNumber(segment.getSequenceNumber())
                .setText(segment.getText())
                .setConfidence(segment.getConfidence())
                .setIsFinal(segment.isFinal())
                .setOffsetMs(segment.getOffsetMs())
                .setDurationMs(segment.getDurationMs())
                .setTimestamp(segment.getTimestamp())
                .build();

        try {
            requestObserver.onNext(request);
        } catch (Exception e) {
            log.error("Failed to send segment via gRPC: streamId={}, seq={}",
                    streamId, segment.getSequenceNumber(), e);
            connected.set(false);
        }
    }

    @Override
    public boolean isConnected() {
        return connected.get();
    }

    @Override
    public void close() {
        try {
            if (requestObserver != null) {
                requestObserver.onCompleted();
            }
        } catch (Exception ignored) {}

        try {
            channel.shutdown().awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            channel.shutdownNow();
        }
        connected.set(false);
        log.info("gRPC forwarder closed: streamId={}", streamId);
    }
}
