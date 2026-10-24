package com.spandan.notification.infrastructure.channel;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.domain.port.NotificationChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class InAppNotificationChannel implements NotificationChannel {

    private static final Logger log = LoggerFactory.getLogger(InAppNotificationChannel.class);

    @Override
    public String channelName() {
        return "IN_APP";
    }

    @Override
    public boolean supports(NotificationType type) {
        return true;
    }

    @Override
    public ChannelDeliveryResult send(Notification notification, UserNotificationPreference prefs) {
        if (!prefs.isInAppEnabled()) {
            return ChannelDeliveryResult.failure("In-app notifications disabled by user");
        }
        log.debug("In-app delivery for notification {} (already persisted)", notification.getId());
        return ChannelDeliveryResult.success();
    }
}
