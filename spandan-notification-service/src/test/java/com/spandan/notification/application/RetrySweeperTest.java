package com.spandan.notification.application;

import com.spandan.notification.application.service.NotificationOrchestrator;
import com.spandan.notification.application.service.RetrySweeper;
import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.enums.NotificationChannel;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RetrySweeperTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private NotificationOrchestrator orchestrator;

    private RetrySweeper retrySweeper;
    private Notification failedNotification;

    @BeforeEach
    void setUp() {
        retrySweeper = new RetrySweeper(notificationRepository, orchestrator);
        failedNotification = new Notification(UUID.randomUUID(), NotificationType.QUESTIONS_GENERATED,
                "title", "message", NotificationChannel.PUSH, "svc", UUID.randomUUID());
        failedNotification.markFailed("FCM error");
    }

    @Test
    void processRetries_shouldProcessFailedNotifications() {
        when(notificationRepository.findNotificationsToRetry(anyInt(), any(Instant.class)))
                .thenReturn(List.of(failedNotification));

        retrySweeper.processRetries();

        verify(orchestrator).processRetry(failedNotification);
    }

    @Test
    void processRetries_shouldDoNothingWhenNoFailedNotifications() {
        when(notificationRepository.findNotificationsToRetry(anyInt(), any(Instant.class)))
                .thenReturn(List.of());

        retrySweeper.processRetries();

        verify(orchestrator, never()).processRetry(any());
    }

    @Test
    void processRetries_shouldHandleRetryExceptions() {
        when(notificationRepository.findNotificationsToRetry(anyInt(), any(Instant.class)))
                .thenReturn(List.of(failedNotification));
        doThrow(new RuntimeException("DB error")).when(orchestrator).processRetry(failedNotification);

        retrySweeper.processRetries();

        verify(orchestrator).processRetry(failedNotification);
    }

    @Test
    void processRetries_shouldRespectBatchSize() {
        List<Notification> manyNotifications = java.util.stream.IntStream.range(0, 150)
                .mapToObj(i -> failedNotification)
                .map(n -> {
                    Notification copy = new Notification(UUID.randomUUID(), NotificationType.QUESTIONS_GENERATED,
                            "title", "message", NotificationChannel.PUSH, "svc", UUID.randomUUID());
                    copy.markFailed("error");
                    return copy;
                })
                .toList();

        when(notificationRepository.findNotificationsToRetry(anyInt(), any(Instant.class)))
                .thenReturn(manyNotifications);

        retrySweeper.processRetries();

        verify(orchestrator, times(100)).processRetry(any());
    }
}
