package com.spandan.review.application;

import com.spandan.review.application.service.ReviewStateMachine;
import com.spandan.review.domain.enums.ReviewStatus;
import com.spandan.review.domain.exception.ReviewException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ReviewStateMachineTest {

    private ReviewStateMachine stateMachine;

    @BeforeEach
    void setUp() {
        stateMachine = new ReviewStateMachine();
    }

    @Test
    void shouldAllowApproveFromPending() {
        assertDoesNotThrow(() -> stateMachine.guardApprove(ReviewStatus.PENDING_REVIEW));
    }

    @Test
    void shouldRejectApproveFromApproved() {
        assertThrows(ReviewException.class, () -> stateMachine.guardApprove(ReviewStatus.APPROVED));
    }

    @Test
    void shouldRejectApproveFromRejected() {
        assertThrows(ReviewException.class, () -> stateMachine.guardApprove(ReviewStatus.REJECTED));
    }

    @Test
    void shouldRejectApproveFromOrphaned() {
        assertThrows(ReviewException.class, () -> stateMachine.guardApprove(ReviewStatus.ORPHANED));
    }

    @Test
    void shouldAllowRejectFromPending() {
        assertDoesNotThrow(() -> stateMachine.guardReject(ReviewStatus.PENDING_REVIEW));
    }

    @Test
    void shouldRejectRejectFromRejected() {
        assertThrows(ReviewException.class, () -> stateMachine.guardReject(ReviewStatus.REJECTED));
    }

    @Test
    void shouldAllowEditFromPending() {
        assertDoesNotThrow(() -> stateMachine.guardEdit(ReviewStatus.PENDING_REVIEW));
    }

    @Test
    void shouldAllowEditFromApproved() {
        assertDoesNotThrow(() -> stateMachine.guardEdit(ReviewStatus.APPROVED));
    }

    @Test
    void shouldRejectEditFromRejected() {
        assertThrows(ReviewException.class, () -> stateMachine.guardEdit(ReviewStatus.REJECTED));
    }

    @Test
    void shouldRejectEditFromOrphaned() {
        assertThrows(ReviewException.class, () -> stateMachine.guardEdit(ReviewStatus.ORPHANED));
    }

    @Test
    void shouldDetectTerminalStates() {
        assertTrue(stateMachine.isTerminal(ReviewStatus.APPROVED));
        assertTrue(stateMachine.isTerminal(ReviewStatus.REJECTED));
        assertTrue(stateMachine.isTerminal(ReviewStatus.ORPHANED));
        assertFalse(stateMachine.isTerminal(ReviewStatus.PENDING_REVIEW));
    }

    @Test
    void shouldDetectSetCompletion() {
        assertTrue(stateMachine.isSetComplete(5, 2, 2, 1));
        assertFalse(stateMachine.isSetComplete(5, 2, 2, 0));
        assertFalse(stateMachine.isSetComplete(5, 0, 0, 0));
    }
}
