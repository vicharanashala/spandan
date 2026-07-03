package com.spandan.notification.infrastructure.persistence;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.enums.NotificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Page<Notification> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, NotificationStatus status, Pageable pageable);

    long countByUserIdAndStatus(UUID userId, NotificationStatus status);

    @Query("SELECT n FROM Notification n WHERE n.status = 'FAILED' AND n.retryCount < :maxRetries " +
           "AND (n.nextRetryAt IS NULL OR n.nextRetryAt <= :now)")
    List<Notification> findNotificationsToRetry(@Param("maxRetries") int maxRetries, @Param("now") Instant now);

    Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

    @Modifying
    @Query("UPDATE Notification n SET n.status = 'READ', n.readAt = :now, n.updatedAt = :now " +
           "WHERE n.userId = :userId AND n.status IN ('DELIVERED', 'PENDING')")
    int markAllAsRead(@Param("userId") UUID userId, @Param("now") Instant now);
}
