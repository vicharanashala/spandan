package com.spandan.review.domain.port;

import com.spandan.review.domain.entity.Review;

public interface ReviewEventPublisher {
    void questionApproved(Review review, java.util.UUID approvedByAdminId);
    void questionRejected(Review review, String comments, java.util.UUID rejectedByAdminId);
    void questionEdited(Review review, int newVersionNumber, java.util.UUID editedByAdminId);
    void questionOrderChanged(java.util.UUID questionSetId, java.util.List<java.util.UUID> orderedIds, java.util.UUID reorderedByAdminId);
    void questionSaved(java.util.UUID questionSetId, java.util.UUID savedByAdminId);
    void reviewCompleted(java.util.UUID questionSetId, java.util.UUID sessionId,
                         int approvedCount, int rejectedCount, int orphanedCount);
    void readyForPolling(java.util.UUID questionSetId, java.util.UUID sessionId,
                         java.util.List<java.util.UUID> approvedQuestionIds);
}
