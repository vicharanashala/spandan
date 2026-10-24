package com.spandan.recording.application.service;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.enums.StreamStatus;
import com.spandan.recording.domain.exception.StreamAlreadyActiveException;
import com.spandan.recording.domain.exception.StreamNotFoundException;
import com.spandan.recording.domain.port.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class StreamOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(StreamOrchestrator.class);

    private final StreamSessionRepository sessionRepository;
    private final StreamLifecyclePublisher lifecyclePublisher;
    private final AudioProviderFactory providerFactory;
    private final TranscriptForwarderFactory forwarderFactory;

    private final ConcurrentHashMap<UUID, ActiveStream> activeStreams = new ConcurrentHashMap<>();

    public StreamOrchestrator(StreamSessionRepository sessionRepository,
                              StreamLifecyclePublisher lifecyclePublisher,
                              AudioProviderFactory providerFactory,
                              TranscriptForwarderFactory forwarderFactory) {
        this.sessionRepository = sessionRepository;
        this.lifecyclePublisher = lifecyclePublisher;
        this.providerFactory = providerFactory;
        this.forwarderFactory = forwarderFactory;
    }

    @Transactional
    public StreamSession startStream(UUID teacherId, UUID lectureId, UUID sessionId,
                                     com.spandan.recording.domain.enums.AudioFormat audioFormat,
                                     StreamProvider provider) {
        if (activeStreams.containsKey(sessionId)) {
            throw new StreamAlreadyActiveException("Stream already active: " + sessionId);
        }
        if (sessionRepository.existsBySessionId(sessionId)) {
            throw new StreamAlreadyActiveException("Session already exists: " + sessionId);
        }

        StreamSession session = new StreamSession(sessionId, teacherId, lectureId, audioFormat, provider);
        session.transitionTo(StreamStatus.STARTING);
        StreamSession saved = sessionRepository.save(session);

        lifecyclePublisher.publishStarted(saved);
        log.info("Stream started: sessionId={}, teacherId={}, provider={}", sessionId, teacherId, provider);
        return saved;
    }

    public void beginStreaming(UUID sessionId, String wsEndpoint) {
        ActiveStream active = activeStreams.get(sessionId);
        if (active == null) {
            throw new StreamNotFoundException("No active stream for session: " + sessionId);
        }
        active.session.transitionTo(StreamStatus.STREAMING);
        sessionRepository.save(active.session);
        log.info("Stream now STREAMING: sessionId={}", sessionId);
    }

    @Transactional
    public void stopStream(UUID sessionId) {
        ActiveStream active = activeStreams.remove(sessionId);
        if (active == null) {
            throw new StreamNotFoundException("No active stream for session: " + sessionId);
        }

        StreamSession session = active.session;
        session.transitionTo(StreamStatus.STOPPED);
        sessionRepository.save(session);
        lifecyclePublisher.publishStopped(session);

        closeQuietly(active.provider);
        closeQuietly(active.forwarder);
        log.info("Stream stopped: sessionId={}", sessionId);
    }

    public void registerActiveStream(UUID sessionId, StreamSession session,
                                     AudioProvider provider, TranscriptForwarder forwarder) {
        ActiveStream active = new ActiveStream(session, provider, forwarder, new AtomicInteger(0));
        activeStreams.put(sessionId, active);
    }

    public Optional<ActiveStream> getActiveStream(UUID sessionId) {
        return Optional.ofNullable(activeStreams.get(sessionId));
    }

    public boolean isStreamActive(UUID sessionId) {
        return activeStreams.containsKey(sessionId);
    }

    @Transactional
    public void handleProviderError(UUID sessionId, String errorMessage) {
        ActiveStream active = activeStreams.remove(sessionId);
        if (active == null) return;

        StreamSession session = active.session;
        session.setErrorMessage(errorMessage);
        session.transitionTo(StreamStatus.FAILED);
        sessionRepository.save(session);
        lifecyclePublisher.publishFailed(session, errorMessage);

        closeQuietly(active.provider);
        closeQuietly(active.forwarder);
        log.error("Stream failed: sessionId={}, reason={}", sessionId, errorMessage);
    }

    @Transactional
    public void handleInterruption(UUID sessionId, String reason) {
        ActiveStream active = activeStreams.get(sessionId);
        if (active == null) return;

        StreamSession session = active.session;
        session.transitionTo(StreamStatus.INTERRUPTED);
        sessionRepository.save(session);
        lifecyclePublisher.publishInterrupted(session, reason);
        log.warn("Stream interrupted: sessionId={}, reason={}", sessionId, reason);
    }

    @Transactional
    public void handleRecovery(UUID sessionId) {
        ActiveStream active = activeStreams.get(sessionId);
        if (active == null) return;

        StreamSession session = active.session;
        session.transitionTo(StreamStatus.STREAMING);
        sessionRepository.save(session);
        lifecyclePublisher.publishRecovered(session);
        log.info("Stream recovered: sessionId={}", sessionId);
    }

    public void forwardSegment(UUID sessionId, TranscriptSegment segment) {
        ActiveStream active = activeStreams.get(sessionId);
        if (active == null) return;

        TranscriptForwarder forwarder = active.forwarder;
        if (forwarder != null && forwarder.isConnected()) {
            forwarder.sendSegment(segment);
            active.session.incrementChunksSent();
        } else {
            active.session.incrementChunksDropped();
            log.warn("Segment dropped (forwarder disconnected): sessionId={}, seq={}", sessionId, segment.getSequenceNumber());
        }
    }

    public AudioProvider createProvider(StreamProvider provider) {
        return providerFactory.create(provider);
    }

    public TranscriptForwarder createForwarder(UUID sessionId) {
        return forwarderFactory.create(sessionId.toString());
    }

    private void closeQuietly(AutoCloseable closeable) {
        if (closeable != null) {
            try { closeable.close(); } catch (Exception ignored) {}
        }
    }

    public static class ActiveStream {
        private final StreamSession session;
        private final AudioProvider provider;
        private final TranscriptForwarder forwarder;
        private final AtomicInteger sequenceCounter;

        ActiveStream(StreamSession session, AudioProvider provider,
                     TranscriptForwarder forwarder, AtomicInteger sequenceCounter) {
            this.session = session;
            this.provider = provider;
            this.forwarder = forwarder;
            this.sequenceCounter = sequenceCounter;
        }

        public StreamSession getSession() { return session; }
        public AudioProvider getProvider() { return provider; }
        public TranscriptForwarder getForwarder() { return forwarder; }
        public int nextSequence() { return sequenceCounter.getAndIncrement(); }
    }
}
