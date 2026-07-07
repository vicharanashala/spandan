package com.spandan.notification.application;

import com.spandan.notification.application.service.ChannelRouter;
import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationChannel;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.infrastructure.kafka.producers.NotificationEventProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChannelRouterTest {

    @Mock private com.spandan.notification.domain.port.NotificationChannel inAppChannel;
    @Mock private com.spandan.notification.domain.port.NotificationChannel pushChannel;
    @Mock private com.spandan.notification.domain.port.NotificationChannel webSocketChannel;
    @Mock private NotificationEventProducer eventProducer;

    private ChannelRouter router;
    private UserNotificationPreference prefs;
    private Notification notification;

    @BeforeEach
    void setUp() {
        router = new ChannelRouter(List.of(inAppChannel, pushChannel, webSocketChannel), eventProducer);
        prefs = new UserNotificationPreference(UUID.randomUUID());
        notification = new Notification(UUID.randomUUID(), NotificationType.QUESTIONS_GENERATED,
                "Title", "Message", NotificationChannel.IN_APP, "test", UUID.randomUUID());
    }

    @Test
    void deliver_shouldUseSupportedChannel() {
        when(inAppChannel.supports(any())).thenReturn(true);
        when(inAppChannel.channelName()).thenReturn("IN_APP");
        when(inAppChannel.send(any(), any())).thenReturn(ChannelDeliveryResult.success());

        ChannelDeliveryResult result = router.deliver(notification, prefs);

        assertTrue(result.isSuccess());
        verify(inAppChannel).send(notification, prefs);
    }

    @Test
    void deliver_shouldFallbackToNextChannel() {
        when(inAppChannel.supports(any())).thenReturn(false);
        when(pushChannel.supports(any())).thenReturn(true);
        when(pushChannel.channelName()).thenReturn("PUSH");
        when(pushChannel.send(any(), any())).thenReturn(ChannelDeliveryResult.success());

        ChannelDeliveryResult result = router.deliver(notification, prefs);

        assertTrue(result.isSuccess());
        verify(pushChannel).send(notification, prefs);
    }

    @Test
    void deliver_shouldReturnSuccessWhenNoMatchingChannel() {
        when(inAppChannel.supports(any())).thenReturn(false);
        when(pushChannel.supports(any())).thenReturn(false);
        when(webSocketChannel.supports(any())).thenReturn(false);

        ChannelDeliveryResult result = router.deliver(notification, prefs);
        assertTrue(result.isSuccess());
    }

    @Test
    void deliverAsync_shouldSendNotificationCreatedForWebSocket() {
        when(webSocketChannel.supports(any())).thenReturn(true);
        when(webSocketChannel.channelName()).thenReturn("WEBSOCKET");

        router.deliverAsync(notification, prefs, UUID.randomUUID(), UUID.randomUUID());

        verify(eventProducer).sendNotificationCreated(any(), any(), any());
    }

    @Test
    void deliver_shouldReturnFailureWhenChannelFails() {
        when(inAppChannel.supports(any())).thenReturn(true);
        when(inAppChannel.channelName()).thenReturn("IN_APP");
        when(inAppChannel.send(any(), any())).thenReturn(ChannelDeliveryResult.failure("Service unavailable"));

        ChannelDeliveryResult result = router.deliver(notification, prefs);
        assertFalse(result.isSuccess());
        assertEquals("Service unavailable", result.getErrorMessage());
    }
}
