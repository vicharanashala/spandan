package com.spandan.review.application.service;

import com.spandan.review.domain.enums.ReviewStatus;
import com.spandan.review.domain.exception.ReviewException;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;

@Component
public class ReviewStateMachine {

    private static final Set<ReviewStatus> TERMINAL_STATES = EnumSet.of(
        ReviewStatus.APPROVED, ReviewStatus.REJECTED, ReviewStatus.ORPHANED
    );

    public void guardTransition(ReviewStatus current, ReviewStatus target, String action) {
        if (TERMINAL_STATES.contains(current)) {
            throw ReviewException.badRequest(
                "Cannot " + action + " a question with terminal status " + current
            );
        }
        if (current != ReviewStatus.PENDING_REVIEW) {
            throw ReviewException.badRequest(
                "Cannot " + action + " from status " + current
            );
        }
    }

    public void guardApprove(ReviewStatus current) {
        guardTransition(current, ReviewStatus.APPROVED, "approve");
    }

    public void guardReject(ReviewStatus current) {
        guardTransition(current, ReviewStatus.REJECTED, "reject");
    }

    public void guardEdit(ReviewStatus current) {
        if (current == ReviewStatus.REJECTED || current == ReviewStatus.ORPHANED) {
            throw ReviewException.badRequest(
                "Cannot edit a question with status " + current
            );
        }
    }

    public boolean isTerminal(ReviewStatus status) {
        return TERMINAL_STATES.contains(status);
    }

    public boolean isSetComplete(long totalQuestions, long approvedCount, long rejectedCount, long orphanedCount) {
        return (approvedCount + rejectedCount + orphanedCount) == totalQuestions;
    }
}
