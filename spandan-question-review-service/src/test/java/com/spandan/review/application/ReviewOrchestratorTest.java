package com.spandan.review.application;

import com.spandan.review.application.service.ReviewOrchestrator;
import com.spandan.review.application.service.ReviewStateMachine;
import com.spandan.review.domain.entity.QuestionVersion;
import com.spandan.review.domain.entity.Review;
import com.spandan.review.domain.entity.ReviewAuditLog;
import com.spandan.review.domain.enums.AuditAction;
import com.spandan.review.domain.enums.ReviewStatus;
import com.spandan.review.domain.exception.ReviewException;
import com.spandan.review.domain.port.ReviewEventPublisher;
import com.spandan.review.infrastructure.persistence.QuestionVersionRepository;
import com.spandan.review.infrastructure.persistence.ReviewAuditLogRepository;
import com.spandan.review.infrastructure.persistence.ReviewRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewOrchestratorTest {

    @Mock private ReviewRepository reviewRepository;
    @Mock private QuestionVersionRepository questionVersionRepository;
    @Mock private ReviewAuditLogRepository auditLogRepository;
    @Mock private ReviewEventPublisher eventPublisher;

    private ReviewStateMachine stateMachine;
    private ReviewOrchestrator orchestrator;
    private Review review;
    private UUID adminId;

    @BeforeEach
    void setUp() {
        stateMachine = new ReviewStateMachine();
        orchestrator = new ReviewOrchestrator(reviewRepository, questionVersionRepository,
            auditLogRepository, stateMachine, eventPublisher);

        adminId = UUID.randomUUID();
        review = new Review();
        review.setId(UUID.randomUUID());
        review.setQuestionId(UUID.randomUUID());
        review.setQuestionSetId(UUID.randomUUID());
        review.setSessionId(UUID.randomUUID());
        review.setAdminId(adminId);
        review.setTeacherId(adminId);
        review.setOriginalAiQuestion("What is 2+2?");
        review.setQuestionType("MCQ");
        review.setReviewStatus(ReviewStatus.PENDING_REVIEW);
        review.setVersion(0);
    }

    @Test
    void approve_shouldTransitionToApproved() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        when(reviewRepository.countByQuestionSetId(review.getQuestionSetId())).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.APPROVED)).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.REJECTED)).thenReturn(0L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.ORPHANED)).thenReturn(0L);

        var result = orchestrator.approve(review.getId(), adminId, 0, "Looks good");

        assertEquals(ReviewStatus.APPROVED, result.getReviewStatus());
        verify(eventPublisher).questionApproved(review, adminId);
        verify(eventPublisher).reviewCompleted(any(), any(), eq(1), eq(0), eq(0));
        verify(eventPublisher).readyForPolling(any(), any(), any());
        verify(auditLogRepository).save(argThat(log -> log.getAction() == AuditAction.APPROVED));
    }

    @Test
    void approve_shouldRejectStaleVersion() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        review.setVersion(1);

        assertThrows(ReviewException.class, () ->
            orchestrator.approve(review.getId(), adminId, 0, "Looks good"));
    }

    @Test
    void approve_shouldRejectNonOwner() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        UUID otherAdmin = UUID.randomUUID();

        assertThrows(ReviewException.class, () ->
            orchestrator.approve(review.getId(), otherAdmin, 0, "Looks good"));
    }

    @Test
    void reject_shouldTransitionToRejected() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        when(reviewRepository.countByQuestionSetId(review.getQuestionSetId())).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.APPROVED)).thenReturn(0L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.REJECTED)).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.ORPHANED)).thenReturn(0L);

        var result = orchestrator.reject(review.getId(), adminId, 0, "Incorrect");

        assertEquals(ReviewStatus.REJECTED, result.getReviewStatus());
        verify(eventPublisher).questionRejected(review, "Incorrect", adminId);
        verify(auditLogRepository).save(argThat(log -> log.getAction() == AuditAction.REJECTED));
    }

    @Test
    void reject_shouldRequireComments() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));

        assertThrows(ReviewException.class, () ->
            orchestrator.reject(review.getId(), adminId, 0, ""));
    }

    @Test
    void edit_shouldCreateVersionAndUpdateReview() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        when(questionVersionRepository.countByReviewId(review.getId())).thenReturn(1);

        var result = orchestrator.edit(review.getId(), adminId, 0,
            "What is 3+3?", "{\"A\":\"5\",\"B\":\"6\"}", "B");

        assertEquals("What is 3+3?", result.getEditedQuestion());
        verify(questionVersionRepository).save(any(QuestionVersion.class));
        verify(eventPublisher).questionEdited(eq(review), eq(2), eq(adminId));
        verify(auditLogRepository).save(argThat(log -> log.getAction() == AuditAction.EDITED));
    }

    @Test
    void edit_shouldRejectForTerminalStatus() {
        review.setReviewStatus(ReviewStatus.REJECTED);
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));

        assertThrows(ReviewException.class, () ->
            orchestrator.edit(review.getId(), adminId, 0, "New text", "{}", "A"));
    }

    @Test
    void editAndApprove_shouldCreateVersionAndApprove() {
        when(reviewRepository.findById(review.getId())).thenReturn(Optional.of(review));
        when(questionVersionRepository.countByReviewId(review.getId())).thenReturn(1);
        when(reviewRepository.countByQuestionSetId(review.getQuestionSetId())).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.APPROVED)).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.REJECTED)).thenReturn(0L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.ORPHANED)).thenReturn(0L);

        var result = orchestrator.editAndApprove(review.getId(), adminId, 0,
            "What is 4+4?", "{\"A\":\"7\",\"B\":\"8\"}", "B", "Edited and approved");

        assertEquals(ReviewStatus.APPROVED, result.getReviewStatus());
        assertEquals("What is 4+4?", result.getEditedQuestion());
        verify(questionVersionRepository).save(any(QuestionVersion.class));
        verify(eventPublisher).questionEdited(eq(review), eq(2), eq(adminId));
        verify(eventPublisher).questionApproved(review, adminId);
        verify(auditLogRepository, atLeast(2)).save(any());
    }

    @Test
    void reorder_shouldUpdateOrder() {
        var r1 = review;
        r1.setId(UUID.randomUUID());
        r1.setQuestionOrder(0);
        var r2 = new Review();
        r2.setId(UUID.randomUUID());
        r2.setAdminId(adminId);
        r2.setQuestionOrder(1);

        when(reviewRepository.findByQuestionSetIdOrderByQuestionOrderAsc(any())).thenReturn(List.of(r1, r2));

        orchestrator.reorder(UUID.randomUUID(), adminId, List.of(r2.getId(), r1.getId()));

        assertEquals(1, r1.getQuestionOrder());
        assertEquals(0, r2.getQuestionOrder());
        verify(eventPublisher).questionOrderChanged(any(), anyList(), any());
    }

    @Test
    void handleOrphanedSet_shouldMarkPendingAsOrphaned() {
        review.setReviewStatus(ReviewStatus.PENDING_REVIEW);
        when(reviewRepository.findByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.PENDING_REVIEW))
            .thenReturn(List.of(review));
        when(reviewRepository.countByQuestionSetId(review.getQuestionSetId())).thenReturn(1L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.APPROVED)).thenReturn(0L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.REJECTED)).thenReturn(0L);
        when(reviewRepository.countByQuestionSetIdAndReviewStatus(review.getQuestionSetId(), ReviewStatus.ORPHANED)).thenReturn(1L);

        orchestrator.handleOrphanedSet(review.getQuestionSetId());

        assertEquals(ReviewStatus.ORPHANED, review.getReviewStatus());
        verify(auditLogRepository).save(argThat(log -> log.getAction() == AuditAction.ORPHANED));
    }
}
