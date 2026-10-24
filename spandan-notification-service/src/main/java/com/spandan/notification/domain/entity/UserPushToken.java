package com.spandan.notification.domain.entity;

import com.spandan.notification.domain.enums.Platform;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_push_tokens",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "device_id"}))
public class UserPushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_id", nullable = false, length = 100)
    private String deviceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Platform platform;

    @Column(name = "push_token", nullable = false, columnDefinition = "TEXT")
    private String pushToken;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public UserPushToken() {}

    public UserPushToken(UUID userId, String deviceId, Platform platform, String pushToken) {
        this.userId = userId;
        this.deviceId = deviceId;
        this.platform = platform;
        this.pushToken = pushToken;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getDeviceId() { return deviceId; }
    public Platform getPlatform() { return platform; }
    public String getPushToken() { return pushToken; }
    public boolean isActive() { return isActive; }
    public Instant getCreatedAt() { return createdAt; }

    public void deactivate() {
        this.isActive = false;
        this.updatedAt = Instant.now();
    }

    public void updateToken(String pushToken) {
        this.pushToken = pushToken;
        this.isActive = true;
        this.updatedAt = Instant.now();
    }
}
