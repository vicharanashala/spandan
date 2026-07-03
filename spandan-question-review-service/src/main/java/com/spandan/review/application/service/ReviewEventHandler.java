package com.spandan.review.application.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.review.infrastructure.persistence.ReviewRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ReviewEventHandler {

    private static final Logger log = LoggerFactory.getLogger(ReviewEventHandler.class);

    private final ReviewRepository reviewRepository;
    private final ReviewOrchestrator orchestrator;
    private final ObjectMapper objectMapper;

    public ReviewEventHandler(ReviewRepository reviewRepository,
                              ReviewOrchestrator orchestrator,
                              ObjectMapper objectMapper) {
        this.reviewRepository = reviewRepository;
        this.orchestrator = orchestrator;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void handleQuestionsReadyForReview(Object value) {
        try {
            JsonNode json = objectMapper.convertValue(value, JsonNode.class);
            UUID setId = UUID.fromString(json.path("setId").asText());
            UUID sessionId = UUID.fromString(json.path("sessionId").asText());
            UUID teacherId = UUID.fromString(json.path("teacherId").asText());
            JsonNode questions = json.path("questions");

            if (!questions.isArray() || questions.isEmpty()) {
                log.warn("QuestionsReadyForReview event for set {} has no questions", setId);
                return;
            }

            int order = 0;
            for (JsonNode q : questions) {
                UUID questionId = UUID.fromString(q.path("id").asText());
                if (reviewRepository.findByQuestionSetIdAndQuestionId(setId, questionId).isPresent()) {
                    log.info("Review already exists for question {} in set {}, skipping", questionId, setId);
                    continue;
                }
                var review = new com.spandan.review.domain.entity.Review();
                review.setQuestionId(questionId);
                review.setQuestionSetId(setId);
                review.setSessionId(sessionId);
                review.setTeacherId(teacherId);
                review.setOriginalAiQuestion(q.path("questionText").asText());
                review.setQuestionType(q.path("questionType").asText());
                review.setQuestionOrder(order++);
                reviewRepository.save(review);
            }

            log.info("Created {} reviews for question set {}", order, setId);
        } catch (Exception e) {
            log.error("Failed to handle QuestionsReadyForReview event", e);
        }
    }

    @Transactional
    public void handleTemporaryQuestionsExpired(Object value) {
        try {
            JsonNode json = objectMapper.convertValue(value, JsonNode.class);
            UUID setId = UUID.fromString(json.path("setId").asText());
            orchestrator.handleOrphanedSet(setId);
            log.info("Marked pending reviews as ORPHANED for expired set {}", setId);
        } catch (Exception e) {
            log.error("Failed to handle TemporaryQuestionsExpired event", e);
        }
    }
}
