package com.spandan.review.domain.entity;

import com.spandan.review.domain.enums.AuditAction;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_audit_log")
public class ReviewAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "review_id", nullable = false)
    private UUID reviewId;

    @Column(name = "admin_id", nullable = false)
    private UUID adminId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false)
    private AuditAction action;

    @Column(name = "action_timestamp", nullable = false)
    private Instant actionTimestamp;

    @Column(name = "details", columnDefinition = "JSONB")
    private String details;

    @PrePersist
    protected void onCreate() {
        actionTimestamp = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getReviewId() { return reviewId; }
    public void setReviewId(UUID reviewId) { this.reviewId = reviewId; }
    public UUID getAdminId() { return adminId; }
    public void setAdminId(UUID adminId) { this.adminId = adminId; }
    public AuditAction getAction() { return action; }
    public void setAction(AuditAction action) { this.action = action; }
    public Instant getActionTimestamp() { return actionTimestamp; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
}
