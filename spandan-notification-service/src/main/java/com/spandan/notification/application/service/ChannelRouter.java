package com.spandan.notification.application.service;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.TargetType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.domain.port.NotificationChannel;
import com.spandan.notification.infrastructure.kafka.producers.NotificationEventProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class ChannelRouter {

    private static final Logger log = LoggerFactory.getLogger(ChannelRouter.class);

    private final List<NotificationChannel> channels;
    private final NotificationEventProducer eventProducer;

    public ChannelRouter(List<NotificationChannel> channels, NotificationEventProducer eventProducer) {
        this.channels = channels;
        this.eventProducer = eventProducer;
    }

    public ChannelDeliveryResult deliver(Notification notification, UserNotificationPreference prefs) {
        for (NotificationChannel channel : channels) {
            if (!channel.supports(notification.getNotificationType())) continue;
            if (!isChannelEnabled(notification.getChannel(), prefs)) continue;

            ChannelDeliveryResult result = channel.send(notification, prefs);
            if (!result.isSuccess()) {
                log.warn("Channel {} failed for notification {}: {}", channel.channelName(), notification.getId(), result.getErrorMessage());
            }
            return result;
        }
        return ChannelDeliveryResult.success();
    }

    public void deliverAsync(Notification notification, UserNotificationPreference prefs,
                             UUID sessionId, UUID quizId) {
        for (NotificationChannel channel : channels) {
            if (!channel.supports(notification.getNotificationType())) continue;
            if (!"WEBSOCKET".equals(channel.channelName())) continue;
            if (!prefs.isPushEnabled() && channel.channelName().equals("PUSH")) continue;

            TargetType targetType = sessionId != null ? TargetType.QUIZ : TargetType.USER;
            UUID targetId = targetType == TargetType.QUIZ ? sessionId : notification.getUserId();
            eventProducer.sendNotificationCreated(notification, targetType, targetId);
        }
    }

    private boolean isChannelEnabled(NotificationChannel channel, UserNotificationPreference prefs) {
        return switch (channel) {
            case IN_APP -> true;
            case PUSH -> prefs.isPushEnabled();
            case WEBSOCKET -> true;
        };
    }
}
