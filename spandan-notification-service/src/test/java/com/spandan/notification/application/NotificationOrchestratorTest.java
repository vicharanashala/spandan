package com.spandan.notification.application;

import com.spandan.notification.application.service.ChannelRouter;
import com.spandan.notification.application.service.NotificationOrchestrator;
import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationStatus;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import com.spandan.notification.infrastructure.persistence.UserNotificationPreferenceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationOrchestratorTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private UserNotificationPreferenceRepository preferenceRepository;
    @Mock private ChannelRouter channelRouter;
    @Captor private ArgumentCaptor<Notification> notificationCaptor;

    private NotificationOrchestrator orchestrator;
    private UUID teacherId;
    private UUID sessionId;

    @BeforeEach
    void setUp() {
        orchestrator = new NotificationOrchestrator(notificationRepository, preferenceRepository, channelRouter);
        teacherId = UUID.randomUUID();
        sessionId = UUID.randomUUID();
        when(channelRouter.deliver(any(), any())).thenReturn(ChannelDeliveryResult.success());
        when(channelRouter.deliverAsync(any(), any(), any(), any())).thenAnswer(i -> {
            return null;
        });
    }

    @Test
    void onQuestionsGenerated_shouldCreateAndDeliver() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));

        orchestrator.onQuestionsGenerated(UUID.randomUUID().toString(), teacherId, sessionId, 5);

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        Notification saved = notificationCaptor.getAllValues().get(0);
        assertEquals(NotificationType.QUESTIONS_GENERATED, saved.getNotificationType());
        assertEquals(teacherId, saved.getUserId());
        assertEquals("Questions Ready for Review", saved.getTitle());
    }

    @Test
    void onQuestionsGenerated_duplicateEvent_shouldSilentlyIgnore() {
        when(notificationRepository.save(any())).thenThrow(DataIntegrityViolationException.class);

        assertDoesNotThrow(() ->
                orchestrator.onQuestionsGenerated(UUID.randomUUID().toString(), teacherId, sessionId, 5));
    }

    @Test
    void onQuestionGenerationFailed_shouldCreateFailureNotification() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));

        orchestrator.onQuestionGenerationFailed(UUID.randomUUID().toString(), teacherId, sessionId, "AI timeout");

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        Notification saved = notificationCaptor.getAllValues().get(0);
        assertEquals(NotificationType.QUESTION_GENERATION_FAILED, saved.getNotificationType());
        assertTrue(saved.getMessage().contains("AI timeout"));
    }

    @Test
    void onReviewCompleted_shouldCreateSummaryNotification() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));

        orchestrator.onReviewCompleted(UUID.randomUUID().toString(), teacherId, sessionId, 3, 1, 0);

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        Notification saved = notificationCaptor.getAllValues().get(0);
        assertEquals(NotificationType.REVIEW_COMPLETED, saved.getNotificationType());
        assertTrue(saved.getMessage().contains("3 approved"));
        assertTrue(saved.getMessage().contains("1 rejected"));
    }

    @Test
    void onQuizStarting_shouldCreateNotificationForEachStudent() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(UUID.randomUUID())));

        List<UUID> studentIds = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        orchestrator.onQuizStarting(UUID.randomUUID().toString(), sessionId, UUID.randomUUID(), 10, studentIds);

        verify(notificationRepository, atLeast(6)).save(any());
    }

    @Test
    void onQuizStarting_duplicateStudent_shouldIgnore() {
        String sourceEventId = UUID.randomUUID().toString();
        UUID studentId = UUID.randomUUID();
        final int[] callCount = {0};
        when(notificationRepository.save(any())).thenAnswer(i -> {
            callCount[0]++;
            if (callCount[0] == 3) throw new DataIntegrityViolationException("");
            return i.getArgument(0);
        });

        assertDoesNotThrow(() ->
                orchestrator.onQuizStarting(sourceEventId, sessionId, UUID.randomUUID(), 5, List.of(studentId, studentId)));
    }

    @Test
    void onTeacherAnalyticsReady_shouldCreateNotification() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));

        orchestrator.onTeacherAnalyticsReady(UUID.randomUUID().toString(), teacherId, sessionId, UUID.randomUUID());

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        assertEquals(NotificationType.TEACHER_ANALYTICS_READY, notificationCaptor.getAllValues().get(0).getNotificationType());
    }

    @Test
    void onStudentAnalyticsReady_shouldCreateNotification() {
        UUID studentId = UUID.randomUUID();
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(studentId)));

        orchestrator.onStudentAnalyticsReady(UUID.randomUUID().toString(), studentId, sessionId, UUID.randomUUID());

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        assertEquals(NotificationType.STUDENT_ANALYTICS_READY, notificationCaptor.getAllValues().get(0).getNotificationType());
    }

    @Test
    void onTranscriptGenerationFailed_shouldCreateFailureNotification() {
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));

        orchestrator.onTranscriptGenerationFailed(UUID.randomUUID().toString(), teacherId, sessionId, "Provider unavailable");

        verify(notificationRepository, atLeast(2)).save(notificationCaptor.capture());
        assertEquals(NotificationType.TRANSCRIPT_GENERATION_FAILED, notificationCaptor.getAllValues().get(0).getNotificationType());
    }

    @Test
    void retryNotification_shouldResetAndDeliver() {
        UUID notificationId = UUID.randomUUID();
        Notification notification = new Notification(teacherId, NotificationType.QUESTIONS_GENERATED,
                "title", "message", com.spandan.notification.domain.enums.NotificationChannel.PUSH,
                "svc", UUID.randomUUID());
        notification.markFailed("FCM error");

        when(notificationRepository.findById(notificationId)).thenReturn(Optional.of(notification));
        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));
        when(channelRouter.deliver(any(), any())).thenReturn(ChannelDeliveryResult.success());

        orchestrator.retryNotification(notificationId);

        assertEquals(NotificationStatus.DELIVERED, notification.getStatus());
        assertEquals(0, notification.getRetryCount());
    }

    @Test
    void processRetry_shouldHandleFailureAndScheduleNext() {
        Notification notification = new Notification(teacherId, NotificationType.QUESTIONS_GENERATED,
                "title", "message", com.spandan.notification.domain.enums.NotificationChannel.PUSH,
                "svc", UUID.randomUUID());
        notification.markFailed("fail");

        when(notificationRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(preferenceRepository.findByUserId(any())).thenReturn(Optional.of(new UserNotificationPreference(teacherId)));
        when(channelRouter.deliver(any(), any())).thenReturn(ChannelDeliveryResult.failure("Still down"));

        orchestrator.processRetry(notification);

        assertEquals(NotificationStatus.FAILED, notification.getStatus());
        assertTrue(notification.getRetryCount() > 0);
        assertNotNull(notification.getNextRetryAt());
    }
}
