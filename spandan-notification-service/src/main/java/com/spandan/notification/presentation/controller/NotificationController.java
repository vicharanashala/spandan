package com.spandan.notification.presentation.controller;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.enums.NotificationStatus;
import com.spandan.notification.domain.enums.RecipientRole;
import com.spandan.notification.domain.exception.NotificationException;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import com.spandan.notification.infrastructure.persistence.UserPushTokenRepository;
import com.spandan.notification.application.service.NotificationOrchestrator;
import com.spandan.notification.presentation.dto.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final UserPushTokenRepository pushTokenRepository;
    private final NotificationOrchestrator orchestrator;

    public NotificationController(NotificationRepository notificationRepository,
                                  UserPushTokenRepository pushTokenRepository,
                                  NotificationOrchestrator orchestrator) {
        this.notificationRepository = notificationRepository;
        this.pushTokenRepository = pushTokenRepository;
        this.orchestrator = orchestrator;
    }

    @GetMapping
    public ResponseEntity<Page<NotificationResponse>> getNotifications(
            Authentication auth,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {

        UUID userId = getUserId(auth);
        RecipientRole userRole = getRole(auth);
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<Notification> notifications;
        if (role != null && !role.isBlank()) {
            RecipientRole filterRole = RecipientRole.valueOf(role.toUpperCase());
            if (status != null && !status.isBlank()) {
                notifications = notificationRepository.findByUserIdAndStatusAndRecipientRoleOrderByCreatedAtDesc(
                        userId, NotificationStatus.valueOf(status.toUpperCase()), filterRole, pageRequest);
            } else {
                notifications = notificationRepository.findByUserIdAndRecipientRoleOrderByCreatedAtDesc(
                        userId, filterRole, pageRequest);
            }
        } else if (status != null && !status.isBlank()) {
            notifications = notificationRepository.findByUserIdAndStatusOrderByCreatedAtDesc(
                    userId, NotificationStatus.valueOf(status.toUpperCase()), pageRequest);
        } else {
            notifications = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageRequest);
        }

        return ResponseEntity.ok(notifications.map(NotificationResponse::from));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<Void> markAsRead(Authentication auth, @PathVariable UUID id) {
        UUID userId = getUserId(auth);
        RecipientRole userRole = getRole(auth);
        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> NotificationException.notFound(id));

        if (!notification.getUserId().equals(userId)) {
            throw NotificationException.notOwned();
        }
        if (notification.getRecipientRole() != userRole) {
            throw NotificationException.notOwned();
        }

        notification.markRead();
        notificationRepository.save(notification);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/read-all")
    public ResponseEntity<MarkAllReadResponse> markAllAsRead(Authentication auth) {
        UUID userId = getUserId(auth);
        int updated = notificationRepository.markAllAsRead(userId, Instant.now());
        return ResponseEntity.ok(new MarkAllReadResponse(updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNotification(Authentication auth, @PathVariable UUID id) {
        UUID userId = getUserId(auth);
        RecipientRole userRole = getRole(auth);
        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> NotificationException.notFound(id));

        if (!notification.getUserId().equals(userId)) {
            throw NotificationException.notOwned();
        }
        if (notification.getRecipientRole() != userRole) {
            throw NotificationException.notOwned();
        }

        notificationRepository.delete(notification);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/retry")
    @PreAuthorize("hasAnyRole('TEACHER', 'ADMIN')")
    public ResponseEntity<Void> retryNotification(@PathVariable UUID id) {
        orchestrator.retryNotification(id);
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/stats")
    public ResponseEntity<StatsResponse> getStats(Authentication auth) {
        UUID userId = getUserId(auth);
        RecipientRole userRole = getRole(auth);
        long unread = notificationRepository.countByUserIdAndStatusAndRecipientRole(userId, NotificationStatus.PENDING, userRole);
        long delivered = notificationRepository.countByUserIdAndStatusAndRecipientRole(userId, NotificationStatus.DELIVERED, userRole);
        long failed = notificationRepository.countByUserIdAndStatusAndRecipientRole(userId, NotificationStatus.FAILED, userRole);
        return ResponseEntity.ok(new StatsResponse(unread, delivered, failed));
    }

    @PostMapping("/push-tokens")
    public ResponseEntity<Void> registerPushToken(Authentication auth, @Valid @RequestBody PushTokenRequest request) {
        UUID userId = getUserId(auth);
        var existing = pushTokenRepository.findByUserIdAndDeviceId(userId, request.deviceId());

        if (existing.isPresent()) {
            var token = existing.get();
            token.updateToken(request.pushToken());
            pushTokenRepository.save(token);
        } else {
            var newToken = new com.spandan.notification.domain.entity.UserPushToken(
                    userId, request.deviceId(), request.platform(), request.pushToken());
            pushTokenRepository.save(newToken);
        }

        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/push-tokens/{deviceId}")
    public ResponseEntity<Void> removePushToken(Authentication auth, @PathVariable String deviceId) {
        UUID userId = getUserId(auth);
        var existing = pushTokenRepository.findByUserIdAndDeviceId(userId, deviceId);
        existing.ifPresent(token -> {
            token.deactivate();
            pushTokenRepository.save(token);
        });
        return ResponseEntity.noContent().build();
    }

    private UUID getUserId(Authentication auth) {
        return (UUID) auth.getPrincipal();
    }

    private RecipientRole getRole(Authentication auth) {
        String role = auth.getAuthorities().stream()
                .findFirst()
                .map(g -> g.getAuthority().replace("ROLE_", ""))
                .orElse("TEACHER");
        return RecipientRole.valueOf(role);
    }
}
