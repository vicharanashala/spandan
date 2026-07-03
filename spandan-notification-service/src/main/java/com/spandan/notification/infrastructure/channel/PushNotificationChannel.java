package com.spandan.notification.infrastructure.channel;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.entity.UserPushToken;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.domain.port.NotificationChannel;
import com.spandan.notification.infrastructure.persistence.UserPushTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PushNotificationChannel implements NotificationChannel {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationChannel.class);

    private final UserPushTokenRepository tokenRepository;

    public PushNotificationChannel(UserPushTokenRepository tokenRepository) {
        this.tokenRepository = tokenRepository;
    }

    @Override
    public String channelName() {
        return "PUSH";
    }

    @Override
    public boolean supports(NotificationType type) {
        return type != NotificationType.QUIZ_STARTING;
    }

    @Override
    public ChannelDeliveryResult send(Notification notification, UserNotificationPreference prefs) {
        if (!prefs.isPushEnabled()) {
            return ChannelDeliveryResult.failure("Push notifications disabled by user");
        }

        List<UserPushToken> tokens = tokenRepository.findByUserIdAndIsActiveTrue(notification.getUserId());
        if (tokens.isEmpty()) {
            return ChannelDeliveryResult.failure("No active push tokens found");
        }

        boolean anySucceeded = false;
        for (UserPushToken token : tokens) {
            try {
                sendFcmMessage(token, notification);
                anySucceeded = true;
            } catch (Exception e) {
                log.warn("FCM send failed for token {}: {}", token.getId(), e.getMessage());
                if (isInvalidTokenError(e)) {
                    token.deactivate();
                    tokenRepository.save(token);
                }
            }
        }

        return anySucceeded ? ChannelDeliveryResult.success()
                : ChannelDeliveryResult.failure("All FCM send attempts failed");
    }

    private void sendFcmMessage(UserPushToken token, Notification notification) {
        log.debug("Sending push notification {} to token {} (platform: {})",
                notification.getId(), token.getId(), token.getPlatform());
        throw new UnsupportedOperationException("FCM integration requires Firebase Admin SDK dependency. " +
                "Implement send() with com.google.firebase:firebase-admin and the service account credentials.");
    }

    private boolean isInvalidTokenError(Exception e) {
        String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
        return msg.contains("not found") || msg.contains("unregistered") || msg.contains("invalid");
    }
}
