package com.spandan.review.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.spandan.review.application.service.ReviewEventHandler;
import com.spandan.review.application.service.ReviewOrchestrator;
import com.spandan.review.domain.entity.Review;
import com.spandan.review.infrastructure.persistence.ReviewRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewEventHandlerTest {

    @Mock private ReviewRepository reviewRepository;
    @Mock private ReviewOrchestrator orchestrator;
    private ObjectMapper objectMapper;
    private ReviewEventHandler eventHandler;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        eventHandler = new ReviewEventHandler(reviewRepository, orchestrator, objectMapper);
    }

    @Test
    void handleQuestionsReadyForReview_shouldCreateReviewRows() {
        var event = Map.of(
            "setId", UUID.randomUUID().toString(),
            "sessionId", UUID.randomUUID().toString(),
            "teacherId", UUID.randomUUID().toString(),
            "questions", java.util.List.of(
                Map.of("id", UUID.randomUUID().toString(), "questionType", "MCQ",
                       "questionText", "What is 2+2?", "options", "{\"A\":\"3\",\"B\":\"4\"}",
                       "correctAnswer", "B"),
                Map.of("id", UUID.randomUUID().toString(), "questionType", "TRUE_FALSE",
                       "questionText", "Earth is round", "options", "{\"True\":\"True\",\"False\":\"False\"}",
                       "correctAnswer", "True")
            )
        );
        when(reviewRepository.findByQuestionSetIdAndQuestionId(any(), any())).thenReturn(Optional.empty());

        eventHandler.handleQuestionsReadyForReview(event);

        verify(reviewRepository, times(2)).save(any(Review.class));
    }

    @Test
    void handleQuestionsReadyForReview_shouldSkipExistingReviews() {
        var setId = UUID.randomUUID();
        var questionId = UUID.randomUUID();
        var event = Map.of(
            "setId", setId.toString(),
            "sessionId", UUID.randomUUID().toString(),
            "teacherId", UUID.randomUUID().toString(),
            "questions", java.util.List.of(
                Map.of("id", questionId.toString(), "questionType", "MCQ",
                       "questionText", "What is 2+2?", "options", "{}", "correctAnswer", "B")
            )
        );
        when(reviewRepository.findByQuestionSetIdAndQuestionId(setId, questionId))
            .thenReturn(Optional.of(new Review()));

        eventHandler.handleQuestionsReadyForReview(event);

        verify(reviewRepository, never()).save(any(Review.class));
    }

    @Test
    void handleTemporaryQuestionsExpired_shouldCallOrphanedSet() {
        var setId = UUID.randomUUID();
        var event = Map.of("setId", setId.toString());

        eventHandler.handleTemporaryQuestionsExpired(event);

        verify(orchestrator).handleOrphanedSet(setId);
    }
}
