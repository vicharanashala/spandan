package com.spandan.review.presentation.controller;

import com.spandan.review.application.service.ReviewOrchestrator;
import com.spandan.review.domain.exception.ReviewException;
import com.spandan.review.presentation.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/reviews")
public class ReviewController {

    private final ReviewOrchestrator orchestrator;

    public ReviewController(ReviewOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @GetMapping("/question-set/{questionSetId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public ResponseEntity<List<ReviewResponse>> getByQuestionSet(@PathVariable UUID questionSetId,
                                                                  Authentication auth) {
        var reviews = orchestrator.getByQuestionSetId(questionSetId);
        String role = auth.getAuthorities().stream()
            .findFirst().map(g -> g.getAuthority().replace("ROLE_", "")).orElse("");
        UUID userId = UUID.fromString(auth.getName());

        if ("ADMIN".equals(role)) {
            reviews.forEach(r -> {
                if (!r.getAdminId().equals(userId))
                    throw ReviewException.forbidden("Access denied");
            });
        } else {
            reviews.forEach(r -> {
                if (!r.getTeacherId().equals(userId))
                    throw ReviewException.forbidden("Access denied");
            });
        }
        return ResponseEntity.ok(reviews.stream().map(ReviewResponse::from).toList());
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public ResponseEntity<List<PendingSetResponse>> getPendingSets(Authentication auth) {
        UUID userId = UUID.fromString(auth.getName());
        String role = auth.getAuthorities().stream()
            .findFirst().map(g -> g.getAuthority().replace("ROLE_", "")).orElse("");
        var sets = orchestrator.getPendingSets(userId, role);
        return ResponseEntity.ok(sets.values().stream().map(PendingSetResponse::from).toList());
    }

    @PostMapping("/{reviewId}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReviewResponse> approve(@PathVariable UUID reviewId,
                                                   @Valid @RequestBody ApproveRequest request,
                                                   Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var review = orchestrator.approve(reviewId, adminId, request.getVersion(), request.getComments());
        return ResponseEntity.ok(ReviewResponse.from(review));
    }

    @PostMapping("/{reviewId}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReviewResponse> reject(@PathVariable UUID reviewId,
                                                  @Valid @RequestBody RejectRequest request,
                                                  Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var review = orchestrator.reject(reviewId, adminId, request.getVersion(), request.getComments());
        return ResponseEntity.ok(ReviewResponse.from(review));
    }

    @PutMapping("/{reviewId}/edit")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReviewResponse> edit(@PathVariable UUID reviewId,
                                                @Valid @RequestBody EditRequest request,
                                                Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var review = orchestrator.edit(reviewId, adminId, request.getVersion(),
            request.getQuestionText(), request.getOptions(), request.getCorrectAnswer());
        return ResponseEntity.ok(ReviewResponse.from(review));
    }

    @PostMapping("/{reviewId}/edit-and-approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReviewResponse> editAndApprove(@PathVariable UUID reviewId,
                                                          @Valid @RequestBody EditAndApproveRequest request,
                                                          Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        var review = orchestrator.editAndApprove(reviewId, adminId, request.getVersion(),
            request.getQuestionText(), request.getOptions(), request.getCorrectAnswer(), request.getComments());
        return ResponseEntity.ok(ReviewResponse.from(review));
    }

    @PutMapping("/question-set/{questionSetId}/reorder")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> reorder(@PathVariable UUID questionSetId,
                                         @Valid @RequestBody ReorderRequest request,
                                         Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        orchestrator.reorder(questionSetId, adminId, request.getOrderedReviewIds());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/question-set/{questionSetId}/save")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> save(@PathVariable UUID questionSetId, Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        orchestrator.saveSet(questionSetId, adminId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{reviewId}/history")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public ResponseEntity<ReviewHistoryResponse> getHistory(@PathVariable UUID reviewId,
                                                             Authentication auth) {
        UUID userId = UUID.fromString(auth.getName());
        String role = auth.getAuthorities().stream()
            .findFirst().map(g -> g.getAuthority().replace("ROLE_", "")).orElse("");
        var history = orchestrator.getHistory(reviewId, userId, role);
        return ResponseEntity.ok(ReviewHistoryResponse.from(history.review(), history.versions(), history.auditEntries()));
    }

    @ExceptionHandler(ReviewException.class)
    public ResponseEntity<ErrorResponse> handleReviewException(ReviewException e) {
        var error = new ErrorResponse(e.getStatusCode(), HttpStatus.valueOf(e.getStatusCode()).getReasonPhrase(), e.getMessage());
        return ResponseEntity.status(e.getStatusCode()).body(error);
    }
}
