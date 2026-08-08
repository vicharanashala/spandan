package com.spandan.transcription.application;

import com.spandan.transcription.application.service.SessionBuffer;
import com.spandan.transcription.application.service.TranscriptionOrchestrator;
import com.spandan.transcription.domain.entity.Transcript;
import com.spandan.transcription.domain.enums.ProcessingStatus;
import com.spandan.transcription.infrastructure.kafka.producers.TranscriptionEventProducer;
import com.spandan.transcription.infrastructure.persistence.TranscriptJpaRepository;
import com.spandan.transcription.infrastructure.persistence.TranscriptionAuditJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TranscriptionOrchestratorTest {

    @Mock private TranscriptJpaRepository transcriptRepo;
    @Mock private TranscriptionAuditJpaRepository auditRepo;
    @Mock private TranscriptionEventProducer eventProducer;

    private TranscriptionOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        orchestrator = new TranscriptionOrchestrator(
                transcriptRepo, auditRepo, eventProducer, 5, 30000);
    }

    @Test
    void shouldCreateBufferAndCompleteTranscript() {
        UUID sessionId = UUID.randomUUID();
        UUID streamId = UUID.randomUUID();

        when(transcriptRepo.findBySessionId(sessionId)).thenReturn(Optional.empty());
        when(transcriptRepo.save(any(Transcript.class))).thenAnswer(i -> i.getArgument(0));

        orchestrator.handleSegmentReceived(sessionId, streamId, 1, "Hello", 0.95, false, 0, 500, 1000);
        orchestrator.handleSegmentReceived(sessionId, streamId, 2, "world", 0.98, true, 500, 400, 1500);

        verify(transcriptRepo, times(1)).save(any(Transcript.class));
        verify(eventProducer).publishTranscriptGenerated(any(), eq(sessionId), eq(2), anyLong());
        verify(auditRepo).save(any());
    }

    @Test
    void shouldDetectGapAndFail() {
        UUID sessionId = UUID.randomUUID();
        UUID streamId = UUID.randomUUID();

        when(transcriptRepo.findBySessionId(sessionId)).thenReturn(Optional.empty());

        orchestrator.handleSegmentReceived(sessionId, streamId, 1, "Hello", 0.95, false, 0, 500, 1000);
        orchestrator.handleSegmentReceived(sessionId, streamId, 10, "world", 0.98, true, 500, 400, 1500);

        verify(eventProducer).publishTranscriptGenerationFailed(sessionId, "Gap detected at sequence 10 (expected 2)");
    }

    @Test
    void shouldFailStreamOnInterruption() {
        UUID sessionId = UUID.randomUUID();

        when(transcriptRepo.findBySessionId(sessionId)).thenReturn(Optional.empty());

        orchestrator.handleStreamInterrupted(sessionId);

        verify(eventProducer).publishTranscriptGenerationFailed(sessionId, "Stream interrupted");
    }

    @Test
    void shouldBufferSegmentInOrder() {
        SessionBuffer buffer = new SessionBuffer(
                UUID.randomUUID(), UUID.randomUUID(), 5, 30000);

        buffer.addSegment(1, "Hello", 0.95, false, 0, 500, 1000);
        buffer.addSegment(2, "world", 0.98, true, 500, 400, 1500);

        assertFalse(buffer.isGapDetected());
        assertTrue(buffer.isCompleted());

        SessionBuffer.AssembledTranscript assembled = buffer.assemble();
        assertEquals("Hello world", assembled.text());
        assertEquals(2, assembled.totalSegments());
    }

    @Test
    void shouldDetectGapInBuffer() {
        SessionBuffer buffer = new SessionBuffer(
                UUID.randomUUID(), UUID.randomUUID(), 2, 30000);

        buffer.addSegment(1, "Hello", 0.95, false, 0, 500, 1000);
        buffer.addSegment(10, "world", 0.98, true, 500, 400, 1500);

        assertTrue(buffer.isGapDetected());
    }
}
