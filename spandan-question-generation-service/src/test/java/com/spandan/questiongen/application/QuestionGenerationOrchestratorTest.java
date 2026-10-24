package com.spandan.questiongen.application;

import com.spandan.questiongen.application.service.QuestionGenerationOrchestrator;
import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.entity.QuestionSet;
import com.spandan.questiongen.domain.enums.GenerationStatus;
import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.enums.ReviewStatus;
import com.spandan.questiongen.domain.exception.GenerationException;
import com.spandan.questiongen.domain.port.LockManager;
import com.spandan.questiongen.domain.port.QuestionGenerationProvider;
import com.spandan.questiongen.infrastructure.kafka.producers.QuestionGenerationEventProducer;
import com.spandan.questiongen.infrastructure.persistence.GeneratedQuestionRepository;
import com.spandan.questiongen.infrastructure.persistence.QuestionSetRepository;
import com.spandan.questiongen.infrastructure.provider.ProviderRegistry;
import com.spandan.questiongen.infrastructure.redis.LockRenewalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QuestionGenerationOrchestratorTest {

    @Mock private QuestionSetRepository questionSetRepository;
    @Mock private GeneratedQuestionRepository generatedQuestionRepository;
    @Mock private LockManager lockManager;
    @Mock private LockRenewalService lockRenewalService;
    @Mock private ProviderRegistry providerRegistry;
    @Mock private QuestionGenerationEventProducer eventProducer;
    @Mock private com.spandan.questiongen.application.service.TranscriptServiceClient transcriptServiceClient;
    @Mock private QuestionGenerationProvider testProvider;

    private QuestionGenerationOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        when(providerRegistry.getPrimary()).thenReturn(testProvider);
        when(testProvider.name()).thenReturn("test-provider");
        orchestrator = new QuestionGenerationOrchestrator(
            questionSetRepository, generatedQuestionRepository, lockManager, lockRenewalService,
            providerRegistry, eventProducer, transcriptServiceClient,
            "gpt-4", "mcq_prompt_v1"
        );
    }

    @Test
    void requestGeneration_shouldAcquireLockAndGenerate() {
        UUID transcriptId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID teacherId = UUID.randomUUID();
        UUID lectureId = UUID.randomUUID();

        when(lockManager.acquireLock(transcriptId, anyString())).thenReturn(true);
        when(questionSetRepository.findTopByTranscriptIdOrderByAttemptNumberDesc(transcriptId))
            .thenReturn(Optional.empty());
        when(transcriptServiceClient.getTranscriptText(transcriptId))
            .thenReturn("This is a sample transcript for testing.");
        when(testProvider.generate(any())).thenReturn(
            new QuestionGenerationProvider.GenerationResult(
                List.of(
                    new QuestionGenerationProvider.GeneratedQuestionData("MCQ", "What is 2+2?",
                        java.util.Map.of("A", "3", "B", "4", "C", "5", "D", "6"), "B", "EASY"),
                    new QuestionGenerationProvider.GeneratedQuestionData("TRUE_FALSE", "Earth is flat",
                        java.util.Map.of("True", "True", "False", "False"), "False", "MEDIUM")
                ), 100, true, null
            )
        );

        orchestrator.requestGeneration(transcriptId, sessionId, teacherId, lectureId, null, null);

        verify(lockManager).acquireLock(eq(transcriptId), anyString());
        verify(lockRenewalService).startRenewal(eq(transcriptId), anyString());
        verify(transcriptServiceClient).getTranscriptText(transcriptId);
        verify(testProvider).generate(any());
        verify(questionSetRepository, atLeast(2)).save(any(QuestionSet.class));
        verify(eventProducer).questionsGenerated(any());
        verify(eventProducer).questionsStored(any());
        verify(eventProducer).questionsReadyForReview(any());
        verify(eventProducer, times(2)).questionGeneratedEvent(any(), any(), any(), any());
        verify(lockRenewalService).stopRenewal(transcriptId);
        verify(lockManager).releaseLock(transcriptId);
    }

    @Test
    void requestGeneration_shouldSkipWhenLockNotAcquired() {
        UUID transcriptId = UUID.randomUUID();
        when(lockManager.acquireLock(transcriptId, anyString())).thenReturn(false);

        orchestrator.requestGeneration(transcriptId, UUID.randomUUID(), UUID.randomUUID(), null, null, null);

        verify(questionSetRepository, never()).save(any());
    }

    @Test
    void requestGeneration_shouldMarkFailedWhenProviderFails() {
        UUID transcriptId = UUID.randomUUID();
        when(lockManager.acquireLock(transcriptId, anyString())).thenReturn(true);
        when(questionSetRepository.findTopByTranscriptIdOrderByAttemptNumberDesc(transcriptId))
            .thenReturn(Optional.empty());
        when(transcriptServiceClient.getTranscriptText(transcriptId))
            .thenReturn("Sample transcript");
        when(testProvider.generate(any())).thenReturn(
            new QuestionGenerationProvider.GenerationResult(List.of(), 50, false, "API error")
        );

        orchestrator.requestGeneration(transcriptId, UUID.randomUUID(), UUID.randomUUID(), null, null, null);

        verify(eventProducer).questionGenerationFailed(any(), eq("API error"));
    }

    @Test
    void getById_shouldReturnSet() {
        UUID setId = UUID.randomUUID();
        var set = new QuestionSet();
        set.setId(setId);
        when(questionSetRepository.findById(setId)).thenReturn(Optional.of(set));

        var result = orchestrator.getById(setId);
        assertEquals(setId, result.getId());
    }

    @Test
    void getById_shouldThrowWhenNotFound() {
        UUID setId = UUID.randomUUID();
        when(questionSetRepository.findById(setId)).thenReturn(Optional.empty());

        assertThrows(GenerationException.class, () -> orchestrator.getById(setId));
    }

    @Test
    void savePermanently_shouldSaveSet() {
        UUID setId = UUID.randomUUID();
        var set = new QuestionSet();
        set.setId(setId);
        set.setSavedFlag(false);
        set.setExpiryAt(Instant.now().plusSeconds(3600));
        when(questionSetRepository.findById(setId)).thenReturn(Optional.of(set));

        var result = orchestrator.savePermanently(setId);

        assertTrue(result.isSavedFlag());
        assertNull(result.getExpiryAt());
        verify(questionSetRepository).save(set);
    }

    @Test
    void savePermanently_shouldThrowWhenAlreadySaved() {
        UUID setId = UUID.randomUUID();
        var set = new QuestionSet();
        set.setId(setId);
        set.setSavedFlag(true);
        when(questionSetRepository.findById(setId)).thenReturn(Optional.of(set));

        assertThrows(GenerationException.class, () -> orchestrator.savePermanently(setId));
    }

    @Test
    void deleteSet_shouldDelete() {
        UUID setId = UUID.randomUUID();
        var set = new QuestionSet();
        set.setId(setId);
        when(questionSetRepository.findById(setId)).thenReturn(Optional.of(set));

        orchestrator.deleteSet(setId);
        verify(questionSetRepository).delete(set);
    }
}
