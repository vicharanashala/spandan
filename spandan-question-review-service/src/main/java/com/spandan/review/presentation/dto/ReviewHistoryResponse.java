package com.spandan.review.presentation.dto;

import com.spandan.review.domain.entity.QuestionVersion;
import com.spandan.review.domain.entity.Review;
import com.spandan.review.domain.entity.ReviewAuditLog;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ReviewHistoryResponse(
    ReviewResponse review,
    List<VersionEntry> versions,
    List<AuditEntry> auditLog
) {
    public static ReviewHistoryResponse from(Review review, List<QuestionVersion> versions,
                                               List<ReviewAuditLog> auditEntries) {
        return new ReviewHistoryResponse(
            ReviewResponse.from(review),
            versions.stream().map(v -> new VersionEntry(
                v.getVersionNumber(), v.getQuestionText(), v.getOptions(),
                v.getCorrectAnswer(), v.getEditedByAdminId(), v.getEditedAt()
            )).toList(),
            auditEntries.stream().map(a -> new AuditEntry(
                a.getAction().name(), a.getAdminId(), a.getActionTimestamp(), a.getDetails()
            )).toList()
        );
    }

    public record VersionEntry(int versionNumber, String questionText, String options,
                                String correctAnswer, UUID editedByAdminId, Instant editedAt) {}
    public record AuditEntry(String action, UUID adminId, Instant actionTimestamp, String details) {}
}
