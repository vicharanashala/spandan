package com.spandan.recording.application;

import com.spandan.recording.application.service.StreamOrchestrator;
import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.entity.TranscriptSegment;
import com.spandan.recording.domain.enums.AudioFormat;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.enums.StreamStatus;
import com.spandan.recording.domain.exception.StreamAlreadyActiveException;
import com.spandan.recording.domain.exception.StreamNotFoundException;
import com.spandan.recording.domain.port.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StreamOrchestratorTest {

    @Mock private StreamSessionRepository sessionRepository;
    @Mock private StreamLifecyclePublisher lifecyclePublisher;
    @Mock private AudioProviderFactory providerFactory;
    @Mock private TranscriptForwarderFactory forwarderFactory;
    @Mock private AudioProvider audioProvider;
    @Mock private TranscriptForwarder transcriptForwarder;

    private StreamOrchestrator orchestrator;
    private UUID teacherId;
    private UUID lectureId;
    private UUID sessionId;

    @BeforeEach
    void setUp() {
        orchestrator = new StreamOrchestrator(sessionRepository, lifecyclePublisher,
                providerFactory, forwarderFactory);
        teacherId = UUID.randomUUID();
        lectureId = UUID.randomUUID();
        sessionId = UUID.randomUUID();
    }

    @Test
    void shouldStartStream() {
        when(sessionRepository.existsBySessionId(sessionId)).thenReturn(false);
        when(sessionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        StreamSession session = orchestrator.startStream(teacherId, lectureId, sessionId,
                AudioFormat.PCM16, StreamProvider.DEEPGRAM);

        assertNotNull(session);
        assertEquals(sessionId, session.getSessionId());
        assertEquals(teacherId, session.getTeacherId());
        assertEquals(StreamStatus.STARTING, session.getStatus());
        assertEquals(AudioFormat.PCM16, session.getAudioFormat());
        assertEquals(StreamProvider.DEEPGRAM, session.getProvider());

        verify(sessionRepository).save(any());
        verify(lifecyclePublisher).publishStarted(any());
    }

    @Test
    void shouldThrowWhenDuplicateActiveStream() {
        when(sessionRepository.existsBySessionId(sessionId)).thenReturn(false);
        when(sessionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        orchestrator.startStream(teacherId, lectureId, sessionId,
                AudioFormat.PCM16, StreamProvider.DEEPGRAM);

        assertThrows(StreamAlreadyActiveException.class,
                () -> orchestrator.startStream(teacherId, lectureId, sessionId,
                        AudioFormat.PCM16, StreamProvider.DEEPGRAM));
    }

    @Test
    void shouldThrowWhenSessionExistsInDb() {
        when(sessionRepository.existsBySessionId(sessionId)).thenReturn(true);

        assertThrows(StreamAlreadyActiveException.class,
                () -> orchestrator.startStream(teacherId, lectureId, sessionId,
                        AudioFormat.PCM16, StreamProvider.DEEPGRAM));
    }

    @Test
    void shouldStopActiveStream() {
        StreamSession session = setupActiveStream();

        orchestrator.stopStream(sessionId);

        assertEquals(StreamStatus.STOPPED, session.getStatus());
        assertNotNull(session.getStoppedAt());
        assertFalse(orchestrator.isStreamActive(sessionId));

        verify(sessionRepository).save(session);
        verify(lifecyclePublisher).publishStopped(session);
        verify(transcriptForwarder).close();
        verify(audioProvider).close();
    }

    @Test
    void shouldThrowWhenStoppingInactiveStream() {
        assertThrows(StreamNotFoundException.class,
                () -> orchestrator.stopStream(sessionId));
    }

    @Test
    void shouldHandleProviderError() {
        StreamSession session = setupActiveStream();

        orchestrator.handleProviderError(sessionId, "connection lost");

        assertEquals(StreamStatus.FAILED, session.getStatus());
        assertEquals("connection lost", session.getErrorMessage());
        assertFalse(orchestrator.isStreamActive(sessionId));

        verify(lifecyclePublisher).publishFailed(session, "connection lost");
        verify(transcriptForwarder).close();
        verify(audioProvider).close();
    }

    @Test
    void shouldHandleInterruption() {
        setupActiveStream();

        orchestrator.handleInterruption(sessionId, "network timeout");

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(StreamStatus.INTERRUPTED, active.get().getSession().getStatus());

        verify(lifecyclePublisher).publishInterrupted(any(), eq("network timeout"));
    }

    @Test
    void shouldHandleRecovery() {
        setupActiveStream();

        orchestrator.handleInterruption(sessionId, "network timeout");
        orchestrator.handleRecovery(sessionId);

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(StreamStatus.STREAMING, active.get().getSession().getStatus());

        verify(lifecyclePublisher).publishRecovered(any());
    }

    @Test
    void shouldBeginStreaming() {
        setupActiveStream();

        orchestrator.beginStreaming(sessionId, "wss://provider.com/stream");

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(StreamStatus.STREAMING, active.get().getSession().getStatus());

        verify(sessionRepository).save(any());
        verifyNoInteractions(lifecyclePublisher);
    }

    @Test
    void shouldForwardSegment() {
        setupActiveStream();
        when(transcriptForwarder.isConnected()).thenReturn(true);

        TranscriptSegment segment = new TranscriptSegment(
                sessionId.toString(), sessionId.toString(), 0,
                "hello world", 0.95, true, 1000, 500, System.currentTimeMillis());

        orchestrator.forwardSegment(sessionId, segment);

        verify(transcriptForwarder).sendSegment(segment);

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(1, active.get().getSession().getChunksSent());
    }

    @Test
    void shouldDropSegmentWhenForwarderDisconnected() {
        setupActiveStream();
        when(transcriptForwarder.isConnected()).thenReturn(false);

        TranscriptSegment segment = new TranscriptSegment(
                sessionId.toString(), sessionId.toString(), 0,
                "dropped", 0.8, false, 500, 300, System.currentTimeMillis());

        orchestrator.forwardSegment(sessionId, segment);

        verify(transcriptForwarder, never()).sendSegment(any());

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(1, active.get().getSession().getChunksDropped());
    }

    @Test
    void shouldIncrementSequenceOnEachSegment() {
        setupActiveStream();
        when(transcriptForwarder.isConnected()).thenReturn(true);

        orchestrator.forwardSegment(sessionId, createSegment(1));
        orchestrator.forwardSegment(sessionId, createSegment(2));
        orchestrator.forwardSegment(sessionId, createSegment(3));

        verify(transcriptForwarder, times(3)).sendSegment(any());

        Optional<StreamOrchestrator.ActiveStream> active = orchestrator.getActiveStream(sessionId);
        assertTrue(active.isPresent());
        assertEquals(3, active.get().getSession().getChunksSent());
    }

    @Test
    void shouldReturnIsStreamActive() {
        assertFalse(orchestrator.isStreamActive(sessionId));
        setupActiveStream();
        assertTrue(orchestrator.isStreamActive(sessionId));
        orchestrator.stopStream(sessionId);
        assertFalse(orchestrator.isStreamActive(sessionId));
    }

    @Test
    void shouldCreateProviderThroughFactory() {
        when(providerFactory.create(StreamProvider.DEEPGRAM)).thenReturn(audioProvider);

        AudioProvider result = orchestrator.createProvider(StreamProvider.DEEPGRAM);

        assertSame(audioProvider, result);
        verify(providerFactory).create(StreamProvider.DEEPGRAM);
    }

    @Test
    void shouldCreateForwarderThroughFactory() {
        when(forwarderFactory.create(sessionId.toString())).thenReturn(transcriptForwarder);

        TranscriptForwarder result = orchestrator.createForwarder(sessionId);

        assertSame(transcriptForwarder, result);
        verify(forwarderFactory).create(sessionId.toString());
    }

    @Test
    void interruptionOnNonExistentStreamShouldBeNoop() {
        orchestrator.handleInterruption(UUID.randomUUID(), "test");
        verifyNoInteractions(sessionRepository, lifecyclePublisher);
    }

    @Test
    void recoveryOnNonExistentStreamShouldBeNoop() {
        orchestrator.handleRecovery(UUID.randomUUID());
        verifyNoInteractions(sessionRepository, lifecyclePublisher);
    }

    @Test
    void providerErrorOnNonExistentStreamShouldBeNoop() {
        orchestrator.handleProviderError(UUID.randomUUID(), "test");
        verifyNoInteractions(sessionRepository, lifecyclePublisher, audioProvider, transcriptForwarder);
    }

    private StreamSession setupActiveStream() {
        when(sessionRepository.existsBySessionId(sessionId)).thenReturn(false);
        when(sessionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        StreamSession session = orchestrator.startStream(teacherId, lectureId, sessionId,
                AudioFormat.PCM16, StreamProvider.DEEPGRAM);

        orchestrator.registerActiveStream(sessionId, session, audioProvider, transcriptForwarder);
        return session;
    }

    private TranscriptSegment createSegment(int seq) {
        return new TranscriptSegment(sessionId.toString(), sessionId.toString(), seq,
                "test " + seq, 0.9, true, 0, 0, System.currentTimeMillis());
    }
}
