package com.spandan.notification.domain.port;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationType;

public interface NotificationChannel {
    String channelName();
    boolean supports(NotificationType type);
    ChannelDeliveryResult send(Notification notification, UserNotificationPreference prefs);
}
