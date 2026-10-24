package com.spandan.transcription.infrastructure.grpc;

import com.spandan.transcription.application.service.TranscriptionOrchestrator;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class TranscriptIngestionService extends TranscriptIngestionGrpc.TranscriptIngestionImplBase {

    private static final Logger log = LoggerFactory.getLogger(TranscriptIngestionService.class);

    private final TranscriptionOrchestrator orchestrator;

    public TranscriptIngestionService(TranscriptionOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @Override
    public StreamObserver<TranscriptSegmentRequest> streamTranscript(
            StreamObserver<TranscriptIngestionAck> responseObserver) {
        return new StreamObserver<>() {
            @Override
            public void onNext(TranscriptSegmentRequest request) {
                try {
                    UUID sessionId = UUID.fromString(request.getSessionId());
                    UUID streamId = UUID.fromString(request.getStreamId());

                    orchestrator.handleSegmentReceived(
                            sessionId, streamId,
                            request.getSequenceNumber(),
                            request.getText(),
                            request.getConfidence(),
                            request.getIsFinal(),
                            request.getOffsetMs(),
                            request.getDurationMs(),
                            request.getTimestamp()
                    );

                    TranscriptIngestionAck ack = TranscriptIngestionAck.newBuilder()
                            .setStreamId(request.getStreamId())
                            .setLastReceivedSequence(request.getSequenceNumber())
                            .setAccepted(true)
                            .build();
                    responseObserver.onNext(ack);

                } catch (Exception e) {
                    log.error("Error processing segment for streamId={}: {}", request.getStreamId(), e.getMessage());
                    TranscriptIngestionAck ack = TranscriptIngestionAck.newBuilder()
                            .setStreamId(request.getStreamId())
                            .setAccepted(false)
                            .setErrorMessage(e.getMessage())
                            .build();
                    responseObserver.onNext(ack);
                }
            }

            @Override
            public void onError(Throwable t) {
                log.error("gRPC stream error: {}", t.getMessage());
                responseObserver.onCompleted();
            }

            @Override
            public void onCompleted() {
                log.debug("gRPC stream completed");
                responseObserver.onCompleted();
            }
        };
    }
}
