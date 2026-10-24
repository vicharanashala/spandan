package com.spandan.review.presentation.dto;

import com.spandan.review.domain.entity.Review;
import com.spandan.review.domain.enums.ReviewStatus;

import java.time.Instant;
import java.util.UUID;

public record ReviewResponse(
    UUID id, UUID questionId, UUID questionSetId, UUID sessionId,
    UUID adminId, UUID teacherId,
    String originalAiQuestion, String questionType, String editedQuestion,
    String editedOptions, String editedCorrectAnswer,
    ReviewStatus reviewStatus, String reviewComments, Integer questionOrder,
    boolean savedFlag, int version, Instant reviewedAt, Instant createdAt, Instant updatedAt
) {
    public static ReviewResponse from(Review entity) {
        return new ReviewResponse(
            entity.getId(), entity.getQuestionId(), entity.getQuestionSetId(),
            entity.getSessionId(), entity.getAdminId(), entity.getTeacherId(),
            entity.getOriginalAiQuestion(), entity.getQuestionType(),
            entity.getEditedQuestion(), entity.getEditedOptions(), entity.getEditedCorrectAnswer(),
            entity.getReviewStatus(), entity.getReviewComments(), entity.getQuestionOrder(),
            entity.isSavedFlag(), entity.getVersion(),
            entity.getReviewedAt(), entity.getCreatedAt(), entity.getUpdatedAt()
        );
    }
}
