package com.spandan.recording.infrastructure.provider;

import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.port.AudioProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public class DeepgramAudioProvider implements AudioProvider {

    private static final Logger log = LoggerFactory.getLogger(DeepgramAudioProvider.class);

    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final AtomicReference<WebSocket> webSocket = new AtomicReference<>();
    private volatile Consumer<TranscriptSegment> segmentHandler;
    private volatile Runnable onReady;
    private volatile Consumer<Throwable> onError;
    private final String sessionId;

    private final HttpClient httpClient;

    public DeepgramAudioProvider(String sessionId) {
        this.sessionId = sessionId;
        this.httpClient = HttpClient.newBuilder().build();
    }

    @Override
    public void connect(String endpoint, Consumer<TranscriptSegment> segmentHandler,
                        Runnable onReady, Consumer<Throwable> onError) {
        this.segmentHandler = segmentHandler;
        this.onReady = onReady;
        this.onError = onError;

        try {
            WebSocket.Builder builder = httpClient.newWebSocketBuilder();
            CompletionStage<WebSocket> cs = builder.buildAsync(URI.create(endpoint),
                    new DeepgramWebSocketListener());
            cs.whenComplete((ws, throwable) -> {
                if (throwable != null) {
                    log.error("WebSocket connection failed to {}", endpoint, throwable);
                    if (onError != null) onError.accept(throwable);
                } else {
                    webSocket.set(ws);
                    connected.set(true);
                    log.info("Connected to Deepgram WebSocket: {}", endpoint);
                    if (onReady != null) onReady.run();
                }
            });
        } catch (Exception e) {
            log.error("Failed to initiate WebSocket connection", e);
            if (onError != null) onError.accept(e);
        }
    }

    @Override
    public boolean isConnected() {
        return connected.get();
    }

    @Override
    public boolean sendAudio(byte[] data, int offset, int length) {
        WebSocket ws = webSocket.get();
        if (ws == null || !connected.get()) return false;

        try {
            ByteBuffer buffer = ByteBuffer.wrap(data, offset, length);
            ws.sendBinary(buffer, true);
            return true;
        } catch (Exception e) {
            log.error("Failed to send audio data", e);
            return false;
        }
    }

    @Override
    public void disconnect() {
        WebSocket ws = webSocket.getAndSet(null);
        if (ws != null) {
            ws.sendClose(WebSocket.NORMAL_CLOSURE, "stream_stopped");
        }
        connected.set(false);
    }

    @Override
    public void close() {
        disconnect();
    }

    private class DeepgramWebSocketListener implements WebSocket.Listener {

        private final StringBuilder messageBuffer = new StringBuilder();

        @Override
        public void onOpen(WebSocket webSocket) {
            WebSocket.Listener.super.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            messageBuffer.append(data);
            if (last) {
                String message = messageBuffer.toString();
                messageBuffer.setLength(0);
                handleProviderMessage(message);
            }
            return WebSocket.Listener.super.onText(webSocket, data, last);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            connected.set(false);
            log.info("Deepgram WebSocket closed: status={}, reason={}", statusCode, reason);
            if (onError != null && statusCode != WebSocket.NORMAL_CLOSURE) {
                onError.accept(new RuntimeException("WebSocket closed: " + reason));
            }
            return WebSocket.Listener.super.onClose(webSocket, statusCode, reason);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            connected.set(false);
            log.error("Deepgram WebSocket error", error);
            if (onError != null) onError.accept(error);
        }
    }

    private void handleProviderMessage(String json) {
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(json);

            var channel = root.path("channel");
            var alternatives = channel.path("alternatives");
            if (alternatives.isEmpty() || alternatives.get(0).path("transcript").asText("").isBlank()) {
                return;
            }

            String transcript = alternatives.get(0).path("transcript").asText();
            double confidence = alternatives.get(0).path("confidence").asDouble(0.0);
            boolean isFinal = root.path("is_final").asBoolean(false);
            long offsetMs = (long) (root.path("start").asDouble(0.0) * 1000);
            long durationMs = (long) (root.path("duration").asDouble(0.0) * 1000);

            var segment = new TranscriptSegment(
                    root.path("metadata").path("request_id").asText("unknown"),
                    sessionId,
                    0,
                    transcript,
                    confidence,
                    isFinal,
                    offsetMs,
                    durationMs,
                    System.currentTimeMillis()
            );

            if (segmentHandler != null) {
                segmentHandler.accept(segment);
            }
        } catch (Exception e) {
            log.warn("Failed to parse provider message: {}", e.getMessage());
        }
    }
}
