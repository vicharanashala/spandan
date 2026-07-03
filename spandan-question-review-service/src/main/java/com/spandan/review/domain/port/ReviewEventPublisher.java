package com.spandan.review.domain.port;

import com.spandan.review.domain.entity.Review;

public interface ReviewEventPublisher {
    void questionApproved(Review review);
    void questionRejected(Review review, String comments);
    void questionEdited(Review review, int newVersionNumber);
    void questionOrderChanged(java.util.UUID questionSetId, java.util.List<java.util.UUID> orderedIds);
    void questionSaved(java.util.UUID questionSetId);
    void reviewCompleted(java.util.UUID questionSetId, java.util.UUID sessionId,
                         int approvedCount, int rejectedCount, int orphanedCount);
    void readyForPolling(java.util.UUID questionSetId, java.util.UUID sessionId,
                         java.util.List<java.util.UUID> approvedQuestionIds);
}
