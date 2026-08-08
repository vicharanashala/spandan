package com.spandan.questiongen.application.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.questiongen.domain.enums.ReviewStatus;
import com.spandan.questiongen.infrastructure.persistence.GeneratedQuestionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ReviewStatusSyncService {

    private static final Logger log = LoggerFactory.getLogger(ReviewStatusSyncService.class);

    private final GeneratedQuestionRepository generatedQuestionRepository;
    private final ObjectMapper objectMapper;

    public ReviewStatusSyncService(GeneratedQuestionRepository generatedQuestionRepository,
                                   ObjectMapper objectMapper) {
        this.generatedQuestionRepository = generatedQuestionRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void handleReviewEvent(String eventType, Object value) {
        try {
            JsonNode json = objectMapper.convertValue(value, JsonNode.class);

            switch (eventType) {
                case "QuestionApproved" -> updateReviewStatus(json, ReviewStatus.APPROVED);
                case "QuestionRejected" -> updateReviewStatus(json, ReviewStatus.REJECTED);
                case "QuestionEdited" -> updateQuestionFromEvent(json);
                case "QuestionSaved" -> log.info("QuestionSaved event received (read-model sync): {}", json);
                default -> log.warn("Unknown question review event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to handle review event: {}", eventType, e);
        }
    }

    private void updateReviewStatus(JsonNode json, ReviewStatus status) {
        var questionId = json.path("questionId").asText();
        if (!questionId.isEmpty()) {
            generatedQuestionRepository.findById(UUID.fromString(questionId)).ifPresent(q -> {
                q.setReviewStatus(status);
                generatedQuestionRepository.save(q);
                log.info("Updated question {} review status to {}", questionId, status);
            });
        } else {
            var setId = json.path("setId").asText();
            if (!setId.isEmpty()) {
                var questions = generatedQuestionRepository.findByQuestionSetId(UUID.fromString(setId));
                questions.forEach(q -> {
                    q.setReviewStatus(status);
                    generatedQuestionRepository.save(q);
                });
                log.info("Updated all questions in set {} to {}", setId, status);
            }
        }
    }

    private void updateQuestionFromEvent(JsonNode json) {
        var questionId = json.path("questionId").asText();
        if (!questionId.isEmpty()) {
            generatedQuestionRepository.findById(UUID.fromString(questionId)).ifPresent(q -> {
                var text = json.path("questionText").asText();
                var answer = json.path("correctAnswer").asText();
                var options = json.path("options").toString();
                if (!text.isEmpty()) q.setQuestionText(text);
                if (!answer.isEmpty()) q.setCorrectAnswer(answer);
                if (!options.isEmpty() && !"null".equals(options)) q.setOptions(options);
                generatedQuestionRepository.save(q);
                log.info("Updated question {} from edit event (status unchanged: {})", questionId, q.getReviewStatus());
            });
        }
    }
}
