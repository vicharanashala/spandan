package com.spandan.questiongen.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.spandan.questiongen.application.service.ReviewStatusSyncService;
import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.enums.ReviewStatus;
import com.spandan.questiongen.infrastructure.persistence.GeneratedQuestionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewStatusSyncServiceTest {

    @Mock private GeneratedQuestionRepository generatedQuestionRepository;
    private ObjectMapper objectMapper;
    private ReviewStatusSyncService syncService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        syncService = new ReviewStatusSyncService(generatedQuestionRepository, objectMapper);
    }

    @Test
    void handleReviewEvent_shouldUpdateSingleQuestion() {
        UUID questionId = UUID.randomUUID();
        var question = new GeneratedQuestion();
        question.setId(questionId);
        question.setReviewStatus(ReviewStatus.PENDING_REVIEW);

        var event = Map.of("questionId", questionId.toString());

        when(generatedQuestionRepository.findById(questionId)).thenReturn(Optional.of(question));

        syncService.handleReviewEvent("QuestionApproved", event);

        verify(generatedQuestionRepository).save(question);
        assert question.getReviewStatus() == ReviewStatus.APPROVED;
    }

    @Test
    void handleReviewEvent_shouldUpdateAllQuestionsInSet() {
        UUID setId = UUID.randomUUID();
        var q1 = new GeneratedQuestion(); q1.setId(UUID.randomUUID());
        var q2 = new GeneratedQuestion(); q2.setId(UUID.randomUUID());

        var event = Map.of("setId", setId.toString());

        when(generatedQuestionRepository.findByQuestionSetId(setId)).thenReturn(List.of(q1, q2));

        syncService.handleReviewEvent("QuestionRejected", event);

        verify(generatedQuestionRepository, times(2)).save(any());
    }

    @Test
    void handleReviewEvent_shouldHandleUnknownEvent() {
        syncService.handleReviewEvent("UnknownEvent", Map.of());
        verifyNoInteractions(generatedQuestionRepository);
    }
}
