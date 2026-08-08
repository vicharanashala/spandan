package com.spandan.notification.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_notification_preferences")
public class UserNotificationPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "in_app_enabled", nullable = false)
    private boolean inAppEnabled = true;

    @Column(name = "push_enabled", nullable = false)
    private boolean pushEnabled = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public UserNotificationPreference() {}

    public UserNotificationPreference(UUID userId) {
        this.userId = userId;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public boolean isInAppEnabled() { return inAppEnabled; }
    public boolean isPushEnabled() { return pushEnabled; }
    public Instant getUpdatedAt() { return updatedAt; }
}
