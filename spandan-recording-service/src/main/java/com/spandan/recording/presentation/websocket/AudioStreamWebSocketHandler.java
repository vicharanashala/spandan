package com.spandan.recording.presentation.websocket;

import com.spandan.recording.application.service.StreamOrchestrator;
import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.port.AudioProvider;
import com.spandan.recording.domain.port.TranscriptForwarder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.util.UUID;

@Component
public class AudioStreamWebSocketHandler extends BinaryWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AudioStreamWebSocketHandler.class);

    private final StreamOrchestrator orchestrator;

    public AudioStreamWebSocketHandler(StreamOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession wsSession) {
        log.info("WebSocket connected: sessionId={}", wsSession.getId());
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession wsSession, BinaryMessage message) {
        byte[] payload = message.getPayload().array();

        String sessionIdStr = (String) wsSession.getAttributes().get("sessionId");
        if (sessionIdStr == null) {
            log.warn("No sessionId attribute set for WebSocket session: {}", wsSession.getId());
            return;
        }

        UUID sessionId = UUID.fromString(sessionIdStr);
        var activeOpt = orchestrator.getActiveStream(sessionId);
        if (activeOpt.isEmpty()) {
            log.warn("No active stream for sessionId={}", sessionId);
            return;
        }

        AudioProvider provider = activeOpt.get().getProvider();
        if (provider != null && provider.isConnected()) {
            provider.sendAudio(payload, 0, payload.length);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession wsSession, Throwable exception) {
        String sessionIdStr = (String) wsSession.getAttributes().get("sessionId");
        if (sessionIdStr != null) {
            orchestrator.handleInterruption(UUID.fromString(sessionIdStr), exception.getMessage());
        }
        log.error("WebSocket transport error: {}", exception.getMessage());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession wsSession, CloseStatus status) {
        String sessionIdStr = (String) wsSession.getAttributes().get("sessionId");
        if (sessionIdStr != null) {
            try {
                orchestrator.stopStream(UUID.fromString(sessionIdStr));
            } catch (Exception e) {
                log.warn("Error stopping stream on WebSocket close: {}", e.getMessage());
            }
        }
        log.info("WebSocket closed: sessionId={}, status={}", wsSession.getId(), status);
    }

    public void initStreamingSession(StreamSession session, String providerEndpoint) {
        UUID sessionId = session.getSessionId();

        AudioProvider audioProvider = orchestrator.createProvider(session.getProvider());

        TranscriptForwarder forwarder;
        try {
            forwarder = orchestrator.createForwarder(sessionId);
        } catch (Exception e) {
            log.error("Failed to create gRPC forwarder for sessionId={}", sessionId, e);
            orchestrator.handleProviderError(sessionId, "gRPC forwarder creation failed: " + e.getMessage());
            return;
        }

        if (!forwarder.isConnected()) {
            orchestrator.handleProviderError(sessionId, "gRPC forwarder not connected");
            return;
        }

        orchestrator.registerActiveStream(sessionId, session, audioProvider, forwarder);

        audioProvider.connect(providerEndpoint,
                segment -> {
                    int seq = orchestrator.getActiveStream(sessionId)
                            .map(StreamOrchestrator.ActiveStream::nextSequence)
                            .orElse(0);
                    TranscriptSegment enriched = new TranscriptSegment(
                            sessionId.toString(),
                            sessionId.toString(),
                            seq,
                            segment.getText(),
                            segment.getConfidence(),
                            segment.isFinal(),
                            segment.getOffsetMs(),
                            segment.getDurationMs(),
                            System.currentTimeMillis()
                    );
                    orchestrator.forwardSegment(sessionId, enriched);
                },
                () -> log.info("Provider connected for sessionId={}", sessionId),
                error -> orchestrator.handleProviderError(sessionId, error.getMessage())
        );

        orchestrator.beginStreaming(sessionId, providerEndpoint);
        log.info("Streaming session initialized: sessionId={}", sessionId);
    }

}
