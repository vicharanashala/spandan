package com.spandan.review.infrastructure.persistence;

import com.spandan.review.domain.entity.ReviewAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ReviewAuditLogRepository extends JpaRepository<ReviewAuditLog, UUID> {

    List<ReviewAuditLog> findByReviewIdOrderByActionTimestampAsc(UUID reviewId);
}
