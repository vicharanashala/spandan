package com.spandan.notification.infrastructure.channel;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.domain.port.NotificationChannel;
import com.spandan.notification.infrastructure.kafka.producers.NotificationEventProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class WebSocketNotificationChannel implements NotificationChannel {

    private static final Logger log = LoggerFactory.getLogger(WebSocketNotificationChannel.class);

    private final NotificationEventProducer eventProducer;

    public WebSocketNotificationChannel(NotificationEventProducer eventProducer) {
        this.eventProducer = eventProducer;
    }

    @Override
    public String channelName() {
        return "WEBSOCKET";
    }

    @Override
    public boolean supports(NotificationType type) {
        return type == NotificationType.QUIZ_STARTING;
    }

    @Override
    public ChannelDeliveryResult send(Notification notification, UserNotificationPreference prefs) {
        log.debug("WebSocket delivery for notification {} — handled via async NotificationCreated event",
                notification.getId());
        return ChannelDeliveryResult.success();
    }
}
