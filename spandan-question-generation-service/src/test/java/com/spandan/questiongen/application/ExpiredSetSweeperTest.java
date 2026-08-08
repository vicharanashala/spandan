package com.spandan.questiongen.application;

import com.spandan.questiongen.application.service.ExpiredSetSweeper;
import com.spandan.questiongen.domain.entity.QuestionSet;
import com.spandan.questiongen.infrastructure.kafka.producers.QuestionGenerationEventProducer;
import com.spandan.questiongen.infrastructure.persistence.QuestionSetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ExpiredSetSweeperTest {

    @Mock private QuestionSetRepository questionSetRepository;
    @Mock private QuestionGenerationEventProducer eventProducer;
    private ExpiredSetSweeper sweeper;

    @BeforeEach
    void setUp() {
        sweeper = new ExpiredSetSweeper(questionSetRepository, eventProducer);
    }

    @Test
    void sweepExpiredSets_shouldDeleteExpired() {
        var set = new QuestionSet();
        set.setId(UUID.randomUUID());
        set.setTranscriptId(UUID.randomUUID());
        set.setSessionId(UUID.randomUUID());

        when(questionSetRepository.findExpiredUnsavedSets(any(Instant.class)))
            .thenReturn(List.of(set));

        sweeper.sweepExpiredSets();

        verify(eventProducer).temporaryQuestionsExpired(set);
        verify(questionSetRepository).delete(set);
    }

    @Test
    void sweepExpiredSets_shouldDoNothingWhenNoneExpired() {
        when(questionSetRepository.findExpiredUnsavedSets(any(Instant.class)))
            .thenReturn(List.of());

        sweeper.sweepExpiredSets();

        verifyNoInteractions(eventProducer);
        verify(questionSetRepository, never()).delete(any());
    }
}
