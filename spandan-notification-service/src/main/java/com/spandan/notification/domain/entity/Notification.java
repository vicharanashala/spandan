package com.spandan.notification.domain.entity;

import com.spandan.notification.domain.enums.NotificationChannel;
import com.spandan.notification.domain.enums.NotificationStatus;
import com.spandan.notification.domain.enums.NotificationType;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notifications",
       uniqueConstraints = @UniqueConstraint(columnNames = {"source_event_id", "user_id", "notification_type"}))
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_type", nullable = false, length = 50)
    private NotificationType notificationType;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationStatus status = NotificationStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationChannel channel;

    @Column(name = "source_service", nullable = false, length = 50)
    private String sourceService;

    @Column(name = "source_event_id", nullable = false)
    private UUID sourceEventId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "quiz_id")
    private UUID quizId;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Notification() {}

    public Notification(UUID userId, NotificationType notificationType, String title, String message,
                        NotificationChannel channel, String sourceService, UUID sourceEventId) {
        this.userId = userId;
        this.notificationType = notificationType;
        this.title = title;
        this.message = message;
        this.channel = channel;
        this.sourceService = sourceService;
        this.sourceEventId = sourceEventId;
    }

    public void markDelivered() {
        this.status = NotificationStatus.DELIVERED;
        this.deliveredAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markFailed(String errorMessage) {
        this.status = NotificationStatus.FAILED;
        this.errorMessage = errorMessage;
        this.retryCount++;
        this.updatedAt = Instant.now();
    }

    public void markRead() {
        if (this.readAt == null) {
            this.status = NotificationStatus.READ;
            this.readAt = Instant.now();
            this.updatedAt = Instant.now();
        }
    }

    public void incrementRetry() {
        this.retryCount++;
        this.updatedAt = Instant.now();
    }

    public void scheduleRetry(long delaySeconds) {
        this.nextRetryAt = Instant.now().plusSeconds(delaySeconds);
        this.updatedAt = Instant.now();
    }

    public void resetForRetry() {
        this.retryCount = 0;
        this.status = NotificationStatus.PENDING;
        this.errorMessage = null;
        this.nextRetryAt = null;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public NotificationType getNotificationType() { return notificationType; }
    public String getTitle() { return title; }
    public String getMessage() { return message; }
    public NotificationStatus getStatus() { return status; }
    public NotificationChannel getChannel() { return channel; }
    public String getSourceService() { return sourceService; }
    public UUID getSourceEventId() { return sourceEventId; }
    public UUID getSessionId() { return sessionId; }
    public UUID getQuizId() { return quizId; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public Instant getReadAt() { return readAt; }
    public int getRetryCount() { return retryCount; }
    public Instant getNextRetryAt() { return nextRetryAt; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public void setQuizId(UUID quizId) { this.quizId = quizId; }
    public void setErrorAndFailed(String errorMessage) { this.errorMessage = errorMessage; this.status = NotificationStatus.FAILED; this.updatedAt = Instant.now(); }
}
