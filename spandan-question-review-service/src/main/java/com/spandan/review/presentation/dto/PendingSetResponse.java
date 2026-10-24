package com.spandan.review.presentation.dto;

import com.spandan.review.application.service.ReviewOrchestrator.PendingSetSummary;

import java.util.UUID;

public record PendingSetResponse(
    UUID questionSetId, UUID sessionId, UUID adminId, UUID teacherId,
    int totalQuestions, int pendingCount,
    int approvedCount, int rejectedCount, int orphanedCount
) {
    public static PendingSetResponse from(PendingSetSummary summary) {
        return new PendingSetResponse(
            summary.questionSetId(), summary.sessionId(),
            summary.adminId(), summary.teacherId(),
            summary.totalQuestions(), summary.pendingCount(),
            summary.approvedCount(), summary.rejectedCount(), summary.orphanedCount()
        );
    }
}
