package com.spandan.review.application.service;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class ReviewOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(ReviewOrchestrator.class);

    private final ReviewRepository reviewRepository;
    private final QuestionVersionRepository questionVersionRepository;
    private final ReviewAuditLogRepository auditLogRepository;
    private final ReviewStateMachine stateMachine;
    private final ReviewEventPublisher eventPublisher;

    public ReviewOrchestrator(ReviewRepository reviewRepository,
                              QuestionVersionRepository questionVersionRepository,
                              ReviewAuditLogRepository auditLogRepository,
                              ReviewStateMachine stateMachine,
                              ReviewEventPublisher eventPublisher) {
        this.reviewRepository = reviewRepository;
        this.questionVersionRepository = questionVersionRepository;
        this.auditLogRepository = auditLogRepository;
        this.stateMachine = stateMachine;
        this.eventPublisher = eventPublisher;
    }

    public Review getById(UUID reviewId) {
        return reviewRepository.findById(reviewId)
            .orElseThrow(() -> ReviewException.notFound("Review not found: " + reviewId));
    }

    public List<Review> getByQuestionSetId(UUID questionSetId) {
        return reviewRepository.findByQuestionSetIdOrderByQuestionOrderAsc(questionSetId);
    }

    public Map<UUID, PendingSetSummary> getPendingSets(UUID userId, String role) {
        List<UUID> setIds;
        if ("ADMIN".equals(role)) {
            setIds = reviewRepository.findDistinctQuestionSetIdsByAdminIdAndReviewStatus(
                userId, ReviewStatus.PENDING_REVIEW);
        } else {
            setIds = reviewRepository.findDistinctQuestionSetIdsByTeacherIdAndReviewStatus(
                userId, ReviewStatus.PENDING_REVIEW);
        }
        var result = new LinkedHashMap<UUID, PendingSetSummary>();
        for (var setId : setIds) {
            var reviews = reviewRepository.findByQuestionSetIdAndReviewStatus(setId, ReviewStatus.PENDING_REVIEW);
            long total = reviewRepository.countByQuestionSetId(setId);
            long approved = reviewRepository.countByQuestionSetIdAndReviewStatus(setId, ReviewStatus.APPROVED);
            long rejected = reviewRepository.countByQuestionSetIdAndReviewStatus(setId, ReviewStatus.REJECTED);
            long orphaned = reviewRepository.countByQuestionSetIdAndReviewStatus(setId, ReviewStatus.ORPHANED);
            var first = reviews.stream().findFirst();
            result.put(setId, new PendingSetSummary(
                setId, first.map(Review::getSessionId).orElse(null),
                first.map(Review::getAdminId).orElse(null),
                first.map(Review::getTeacherId).orElse(null),
                (int) total, reviews.size(), (int) approved, (int) rejected, (int) orphaned
            ));
        }
        return result;
    }

    @Transactional
    public Review approve(UUID reviewId, UUID adminId, int version, String comments) {
        var review = getById(reviewId);
        verifyAdminOwnership(review, adminId);
        stateMachine.guardApprove(review.getReviewStatus());

        if (review.getVersion() != version) {
            throw ReviewException.conflict("Stale version " + version + " — current version is " + review.getVersion());
        }

        review.setReviewStatus(ReviewStatus.APPROVED);
        review.setReviewComments(comments);
        review.setReviewedAt(Instant.now());
        reviewRepository.save(review);

        audit(reviewId, adminId, AuditAction.APPROVED, comments != null ? "{\"comments\":\"" + escape(comments) + "\"}" : null);

        eventPublisher.questionApproved(review, adminId);
        checkSetCompletion(review.getQuestionSetId(), review.getSessionId());

        return review;
    }

    @Transactional
    public Review reject(UUID reviewId, UUID adminId, int version, String comments) {
        var review = getById(reviewId);
        verifyAdminOwnership(review, adminId);
        stateMachine.guardReject(review.getReviewStatus());

        if (comments == null || comments.isBlank()) {
            throw ReviewException.badRequest("Comments are required when rejecting a question");
        }
        if (review.getVersion() != version) {
            throw ReviewException.conflict("Stale version " + version + " — current version is " + review.getVersion());
        }

        review.setReviewStatus(ReviewStatus.REJECTED);
        review.setReviewComments(comments);
        review.setReviewedAt(Instant.now());
        reviewRepository.save(review);

        audit(reviewId, adminId, AuditAction.REJECTED, "{\"comments\":\"" + escape(comments) + "\"}");

        eventPublisher.questionRejected(review, comments, adminId);
        checkSetCompletion(review.getQuestionSetId(), review.getSessionId());

        return review;
    }

    @Transactional
    public Review edit(UUID reviewId, UUID adminId, int version,
                       String questionText, String options, String correctAnswer) {
        var review = getById(reviewId);
        verifyAdminOwnership(review, adminId);
        stateMachine.guardEdit(review.getReviewStatus());

        if (review.getVersion() != version) {
            throw ReviewException.conflict("Stale version " + version + " — current version is " + review.getVersion());
        }

        int nextVersionNumber = questionVersionRepository.countByReviewId(reviewId) + 1;

        var versionRecord = new QuestionVersion();
        versionRecord.setReview(review);
        versionRecord.setVersionNumber(nextVersionNumber);
        versionRecord.setQuestionText(questionText);
        versionRecord.setOptions(options);
        versionRecord.setCorrectAnswer(correctAnswer);
        versionRecord.setEditedByAdminId(adminId);
        questionVersionRepository.save(versionRecord);

        review.setEditedQuestion(questionText);
        review.setEditedOptions(options);
        review.setEditedCorrectAnswer(correctAnswer);
        reviewRepository.save(review);

        audit(reviewId, adminId, AuditAction.EDITED,
              "{\"versionNumber\":" + nextVersionNumber + "}");

        eventPublisher.questionEdited(review, nextVersionNumber, adminId);

        return review;
    }

    @Transactional
    public Review editAndApprove(UUID reviewId, UUID adminId, int version,
                                  String questionText, String options,
                                  String correctAnswer, String comments) {
        var review = getById(reviewId);
        verifyAdminOwnership(review, adminId);
        stateMachine.guardApprove(review.getReviewStatus());
        stateMachine.guardEdit(review.getReviewStatus());

        if (review.getVersion() != version) {
            throw ReviewException.conflict("Stale version " + version + " — current version is " + review.getVersion());
        }

        int nextVersionNumber = questionVersionRepository.countByReviewId(reviewId) + 1;

        var versionRecord = new QuestionVersion();
        versionRecord.setReview(review);
        versionRecord.setVersionNumber(nextVersionNumber);
        versionRecord.setQuestionText(questionText);
        versionRecord.setOptions(options);
        versionRecord.setCorrectAnswer(correctAnswer);
        versionRecord.setEditedByAdminId(adminId);
        questionVersionRepository.save(versionRecord);

        review.setEditedQuestion(questionText);
        review.setEditedOptions(options);
        review.setEditedCorrectAnswer(correctAnswer);
        review.setReviewStatus(ReviewStatus.APPROVED);
        review.setReviewComments(comments);
        review.setReviewedAt(Instant.now());
        reviewRepository.save(review);

        audit(reviewId, adminId, AuditAction.EDITED,
              "{\"versionNumber\":" + nextVersionNumber + ",\"autoApproved\":true}");
        audit(reviewId, adminId, AuditAction.APPROVED,
              comments != null ? "{\"comments\":\"" + escape(comments) + "\",\"viaEditAndApprove\":true}" : null);

        eventPublisher.questionEdited(review, nextVersionNumber, adminId);
        eventPublisher.questionApproved(review, adminId);
        checkSetCompletion(review.getQuestionSetId(), review.getSessionId());

        return review;
    }

    @Transactional
    public void reorder(UUID questionSetId, UUID adminId, List<UUID> orderedReviewIds) {
        var reviews = reviewRepository.findByQuestionSetIdOrderByQuestionOrderAsc(questionSetId);
        if (reviews.size() != orderedReviewIds.size()) {
            throw ReviewException.badRequest(
                "List size " + orderedReviewIds.size() + " does not match set size " + reviews.size());
        }
        for (var review : reviews) {
            verifyAdminOwnership(review, adminId);
            int newOrder = orderedReviewIds.indexOf(review.getId());
            if (newOrder < 0) {
                throw ReviewException.badRequest("Review " + review.getId() + " not found in ordered list");
            }
            review.setQuestionOrder(newOrder);
            reviewRepository.save(review);
        }

        var firstReview = reviews.stream().findFirst();
        firstReview.ifPresent(r ->
            audit(r.getId(), adminId, AuditAction.REORDERED,
                  "{\"newOrder\":" + orderedReviewIds + "}"));

        eventPublisher.questionOrderChanged(questionSetId, orderedReviewIds, adminId);
    }

    @Transactional
    public void saveSet(UUID questionSetId, UUID adminId) {
        var reviews = reviewRepository.findByQuestionSetIdOrderByQuestionOrderAsc(questionSetId);
        for (var review : reviews) {
            verifyAdminOwnership(review, adminId);
            review.setSavedFlag(true);
            reviewRepository.save(review);
        }
        if (!reviews.isEmpty()) {
            audit(reviews.get(0).getId(), adminId, AuditAction.SAVED, "{\"questionSetId\":\"" + questionSetId + "\"}");
        }
        eventPublisher.questionSaved(questionSetId, adminId);
    }

    public ReviewHistory getHistory(UUID reviewId, UUID userId, String role) {
        var review = getById(reviewId);
        if ("ADMIN".equals(role)) {
            verifyAdminOwnership(review, userId);
        } else {
            if (!review.getTeacherId().equals(userId)) {
                throw ReviewException.forbidden("Review " + review.getId() + " does not belong to teacher " + userId);
            }
        }
        var versions = questionVersionRepository.findByReviewIdOrderByVersionNumberAsc(reviewId);
        var auditEntries = auditLogRepository.findByReviewIdOrderByActionTimestampAsc(reviewId);
        return new ReviewHistory(review, versions, auditEntries);
    }

    @Transactional
    public void handleOrphanedSet(UUID questionSetId) {
        var pendingReviews = reviewRepository.findByQuestionSetIdAndReviewStatus(
            questionSetId, ReviewStatus.PENDING_REVIEW);
        for (var review : pendingReviews) {
            review.setReviewStatus(ReviewStatus.ORPHANED);
            reviewRepository.save(review);
            audit(review.getId(), review.getAdminId(), AuditAction.ORPHANED,
                  "{\"reason\":\"TemporaryQuestionsExpired\",\"questionSetId\":\"" + questionSetId + "\"}");
        }
        if (!pendingReviews.isEmpty()) {
            var first = pendingReviews.get(0);
            checkSetCompletion(questionSetId, first.getSessionId());
        }
    }

    private void checkSetCompletion(UUID questionSetId, UUID sessionId) {
        long total = reviewRepository.countByQuestionSetId(questionSetId);
        long approved = reviewRepository.countByQuestionSetIdAndReviewStatus(questionSetId, ReviewStatus.APPROVED);
        long rejected = reviewRepository.countByQuestionSetIdAndReviewStatus(questionSetId, ReviewStatus.REJECTED);
        long orphaned = reviewRepository.countByQuestionSetIdAndReviewStatus(questionSetId, ReviewStatus.ORPHANED);

        if (stateMachine.isSetComplete(total, approved, rejected, orphaned)) {
            eventPublisher.reviewCompleted(questionSetId, sessionId, (int) approved, (int) rejected, (int) orphaned);
            if (approved > 0) {
                var approvedReviews = reviewRepository.findByQuestionSetIdAndReviewStatus(
                    questionSetId, ReviewStatus.APPROVED);
                var approvedIds = approvedReviews.stream().map(Review::getQuestionId).toList();
                eventPublisher.readyForPolling(questionSetId, sessionId, approvedIds);
            }
        }
    }

    private void verifyAdminOwnership(Review review, UUID adminId) {
        if (!review.getAdminId().equals(adminId)) {
            throw ReviewException.forbidden("Review " + review.getId() + " does not belong to admin " + adminId);
        }
    }

    private void audit(UUID reviewId, UUID adminId, AuditAction action, String details) {
        var logEntry = new ReviewAuditLog();
        logEntry.setReviewId(reviewId);
        logEntry.setAdminId(adminId);
        logEntry.setAction(action);
        logEntry.setDetails(details);
        auditLogRepository.save(logEntry);
    }

    private String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public record PendingSetSummary(UUID questionSetId, UUID sessionId, UUID adminId, UUID teacherId,
                                     int totalQuestions, int pendingCount,
                                     int approvedCount, int rejectedCount, int orphanedCount) {}

    public record ReviewHistory(Review review, List<QuestionVersion> versions,
                                 List<ReviewAuditLog> auditEntries) {}
}
