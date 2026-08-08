package com.spandan.notification.presentation.dto;

import com.spandan.notification.domain.entity.Notification;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(
        UUID id,
        String type,
        String title,
        String message,
        String status,
        String channel,
        UUID sessionId,
        String recipientRole,
        Instant deliveredAt,
        Instant readAt,
        Instant createdAt) {

    public static NotificationResponse from(Notification n) {
        return new NotificationResponse(
                n.getId(),
                n.getNotificationType().name(),
                n.getTitle(),
                n.getMessage(),
                n.getStatus().name(),
                n.getChannel().name(),
                n.getSessionId(),
                n.getRecipientRole().name(),
                n.getDeliveredAt(),
                n.getReadAt(),
                n.getCreatedAt());
    }
}
