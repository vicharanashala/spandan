package com.spandan.recording.domain;

import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.AudioFormat;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.enums.StreamStatus;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class StreamSessionTest {

    @Test
    void shouldCreateWithPendingStatus() {
        StreamSession session = new StreamSession(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                AudioFormat.PCM16, StreamProvider.DEEPGRAM);

        assertEquals(StreamStatus.PENDING, session.getStatus());
        assertNotNull(session.getId());
        assertNotNull(session.getStartedAt());
        assertEquals(0, session.getChunksSent());
        assertEquals(0, session.getChunksDropped());
    }

    @Test
    void shouldTransitionToStarted() {
        StreamSession session = new StreamSession(UUID.randomUUID(), UUID.randomUUID(), null,
                AudioFormat.OPUS, StreamProvider.ASSEMBLYAI);

        session.transitionTo(StreamStatus.STARTING);
        assertEquals(StreamStatus.STARTING, session.getStatus());
        assertNotNull(session.getUpdatedAt());
    }

    @Test
    void shouldTransitionToStreaming() {
        StreamSession session = createSession();
        session.transitionTo(StreamStatus.STARTING);
        session.transitionTo(StreamStatus.STREAMING);

        assertEquals(StreamStatus.STREAMING, session.getStatus());
    }

    @Test
    void shouldSetStoppedFieldsOnStop() {
        StreamSession session = createSession();
        session.transitionTo(StreamStatus.STARTING);
        session.transitionTo(StreamStatus.STREAMING);

        session.transitionTo(StreamStatus.STOPPED);

        assertEquals(StreamStatus.STOPPED, session.getStatus());
        assertNotNull(session.getStoppedAt());
        assertNotNull(session.getDurationMs());
        assertTrue(session.getDurationMs() >= 0);
    }

    @Test
    void shouldSetStoppedFieldsOnFailed() {
        StreamSession session = createSession();
        session.transitionTo(StreamStatus.STARTING);
        session.setErrorMessage("connection lost");

        session.transitionTo(StreamStatus.FAILED);

        assertEquals(StreamStatus.FAILED, session.getStatus());
        assertNotNull(session.getStoppedAt());
        assertNotNull(session.getDurationMs());
        assertEquals("connection lost", session.getErrorMessage());
    }

    @Test
    void shouldIncrementChunksSent() {
        StreamSession session = createSession();
        session.incrementChunksSent();
        session.incrementChunksSent();
        assertEquals(2, session.getChunksSent());
    }

    @Test
    void shouldIncrementChunksDropped() {
        StreamSession session = createSession();
        session.incrementChunksDropped();
        assertEquals(1, session.getChunksDropped());
    }

    @Test
    void shouldSetWsEndpoint() {
        StreamSession session = createSession();
        session.setWsEndpoint("wss://deepgram.com/v1/abc");
        assertEquals("wss://deepgram.com/v1/abc", session.getWsEndpoint());
    }

    private StreamSession createSession() {
        return new StreamSession(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                AudioFormat.PCM16, StreamProvider.DEEPGRAM);
    }
}
