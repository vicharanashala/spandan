package com.spandan.notification.application.service;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.entity.UserNotificationPreference;
import com.spandan.notification.domain.enums.NotificationChannel;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.domain.port.ChannelDeliveryResult;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import com.spandan.notification.infrastructure.persistence.UserNotificationPreferenceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class NotificationOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(NotificationOrchestrator.class);
    private static final int MAX_RETRIES = 5;
    private static final String SOURCE_QGS = "QuestionGenerationService";
    private static final String SOURCE_QRS = "QuestionReviewService";
    private static final String SOURCE_POLLING = "PollingService";
    private static final String SOURCE_ANALYTICS = "AnalyticsService";
    private static final String SOURCE_TRANSCRIPTION = "TranscriptionService";
    private static final String SOURCE_USER = "UserService";
    private static final String SOURCE_LECTURE = "LectureService";
    private static final String SOURCE_GRADING = "GradingService";

    private final NotificationRepository notificationRepository;
    private final UserNotificationPreferenceRepository preferenceRepository;
    private final ChannelRouter channelRouter;

    public NotificationOrchestrator(NotificationRepository notificationRepository,
                                    UserNotificationPreferenceRepository preferenceRepository,
                                    ChannelRouter channelRouter) {
        this.notificationRepository = notificationRepository;
        this.preferenceRepository = preferenceRepository;
        this.channelRouter = channelRouter;
    }

    @Transactional
    public void onQuestionsGenerated(String sourceEventId, UUID teacherId, UUID sessionId, int questionCount) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.QUESTIONS_GENERATED,
                    "Questions Ready for Review",
                    "AI-generated questions for your session are ready. Please review and approve them.",
                    NotificationChannel.IN_APP, SOURCE_QGS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created QUESTIONS_GENERATED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate QUESTIONS_GENERATED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onQuestionGenerationFailed(String sourceEventId, UUID teacherId, UUID sessionId, String reason) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.QUESTION_GENERATION_FAILED,
                    "Question Generation Failed",
                    "AI question generation failed: " + reason + ". You may retry or generate manually.",
                    NotificationChannel.IN_APP, SOURCE_QGS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created QUESTION_GENERATION_FAILED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate QUESTION_GENERATION_FAILED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onReviewCompleted(String sourceEventId, UUID teacherId, UUID sessionId,
                                  int approvedCount, int rejectedCount, int orphanedCount) {
        try {
            String message = String.format(
                    "Question review completed. %d approved, %d rejected, %d orphaned.",
                    approvedCount, rejectedCount, orphanedCount);
            Notification notification = new Notification(
                    teacherId, NotificationType.REVIEW_COMPLETED,
                    "Review Complete", message,
                    NotificationChannel.IN_APP, SOURCE_QRS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created REVIEW_COMPLETED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate REVIEW_COMPLETED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onQuizStarting(String sourceEventId, UUID sessionId, UUID quizId,
                               int questionCount, List<UUID> studentIds) {
        String title = "Quiz Starting Soon";
        String message = "Question 1 of " + questionCount + " begins in one minute.";

        for (UUID studentId : studentIds) {
            try {
                Notification notification = new Notification(
                        studentId, NotificationType.QUIZ_STARTING,
                        title, message,
                        NotificationChannel.IN_APP, SOURCE_POLLING, UUID.fromString(sourceEventId));
                notification.setSessionId(sessionId);
                notification.setQuizId(quizId);
                notificationRepository.save(notification);
                notification.markDelivered();
                notificationRepository.save(notification);
                deliverToOtherChannels(notification, sessionId, quizId);
            } catch (DataIntegrityViolationException e) {
                log.debug("Duplicate QUIZ_STARTING for student {} in event {} ignored", studentId, sourceEventId);
            }
        }
        log.info("Created QUIZ_STARTING notifications for {} students in quiz {}", studentIds.size(), quizId);
    }

    @Transactional
    public void onTeacherAnalyticsReady(String sourceEventId, UUID teacherId, UUID sessionId, UUID quizId) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.TEACHER_ANALYTICS_READY,
                    "Session Analytics Ready",
                    "Session analytics for your quiz are ready. View the report.",
                    NotificationChannel.IN_APP, SOURCE_ANALYTICS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notification.setQuizId(quizId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, quizId);
            log.info("Created TEACHER_ANALYTICS_READY notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate TEACHER_ANALYTICS_READY event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onStudentAnalyticsReady(String sourceEventId, UUID studentId, UUID sessionId, UUID quizId) {
        try {
            Notification notification = new Notification(
                    studentId, NotificationType.STUDENT_ANALYTICS_READY,
                    "Your Results Are Ready",
                    "Your quiz results are ready. Check your performance.",
                    NotificationChannel.IN_APP, SOURCE_ANALYTICS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notification.setQuizId(quizId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, quizId);
            log.info("Created STUDENT_ANALYTICS_READY notification for student {}", studentId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate STUDENT_ANALYTICS_READY event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onLeaderboardGenerated(String sourceEventId, UUID sessionId, UUID quizId) {
        log.info("Leaderboard generated for quiz {} — individual notifications sent via Teacher/Student events", quizId);
    }

    @Transactional
    public void onQuizCompleted(String sourceEventId, UUID sessionId, UUID quizId) {
        log.info("Quiz {} completed for session {} — notification handled by summary analytics flow", quizId, sessionId);
    }

    @Transactional
    public void onSessionAnalyticsCompleted(String sourceEventId, UUID teacherId, UUID sessionId) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.SESSION_ANALYTICS_COMPLETED,
                    "Session Analytics Completed",
                    "Full session analytics report is now available.",
                    NotificationChannel.IN_APP, SOURCE_ANALYTICS, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created SESSION_ANALYTICS_COMPLETED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate SESSION_ANALYTICS_COMPLETED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onUserLoggedIn(String sourceEventId, UUID userId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.USER_LOGGED_IN,
                    "New Login",
                    "You have successfully logged in to your account.",
                    NotificationChannel.IN_APP, SOURCE_USER, UUID.fromString(sourceEventId));
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Created USER_LOGGED_IN notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate USER_LOGGED_IN event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onUserLoggedOut(String sourceEventId, UUID userId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.USER_LOGGED_OUT,
                    "Logged Out",
                    "You have been logged out of your account.",
                    NotificationChannel.IN_APP, SOURCE_USER, UUID.fromString(sourceEventId));
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Created USER_LOGGED_OUT notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate USER_LOGGED_OUT event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onUserRegistered(String sourceEventId, UUID userId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.USER_REGISTERED,
                    "Welcome to Spandan!",
                    "Your account has been created successfully. Start engaging with your classes.",
                    NotificationChannel.IN_APP, SOURCE_USER, UUID.fromString(sourceEventId));
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Created USER_REGISTERED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate USER_REGISTERED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onUserProfileUpdated(String sourceEventId, UUID userId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.USER_PROFILE_UPDATED,
                    "Profile Updated",
                    "Your account profile has been updated successfully.",
                    NotificationChannel.IN_APP, SOURCE_USER, UUID.fromString(sourceEventId));
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Created USER_PROFILE_UPDATED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate USER_PROFILE_UPDATED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onUserDeactivated(String sourceEventId, UUID userId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.USER_DEACTIVATED,
                    "Account Deactivated",
                    "Your account has been deactivated. Contact support if this was unexpected.",
                    NotificationChannel.IN_APP, SOURCE_USER, UUID.fromString(sourceEventId));
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Created USER_DEACTIVATED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate USER_DEACTIVATED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onLectureCreated(String sourceEventId, UUID teacherId, UUID lectureId, UUID sessionId) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.LECTURE_CREATED,
                    "Lecture Created",
                    "Your new lecture has been created and is ready.",
                    NotificationChannel.IN_APP, SOURCE_LECTURE, UUID.fromString(sourceEventId));
            notification.setLectureId(lectureId);
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created LECTURE_CREATED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate LECTURE_CREATED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onLectureStarted(String sourceEventId, UUID userId, UUID lectureId, UUID sessionId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.LECTURE_STARTED,
                    "Lecture In Progress",
                    "Your lecture is now in progress.",
                    NotificationChannel.IN_APP, SOURCE_LECTURE, UUID.fromString(sourceEventId));
            notification.setLectureId(lectureId);
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created LECTURE_STARTED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate LECTURE_STARTED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onLectureEnded(String sourceEventId, UUID teacherId, UUID lectureId, UUID sessionId) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.LECTURE_ENDED,
                    "Lecture Ended",
                    "Your lecture has ended. Analytics will be available shortly.",
                    NotificationChannel.IN_APP, SOURCE_LECTURE, UUID.fromString(sourceEventId));
            notification.setLectureId(lectureId);
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created LECTURE_ENDED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate LECTURE_ENDED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onGradingCompleted(String sourceEventId, UUID userId, UUID sessionId, UUID quizId) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.GRADING_COMPLETED,
                    "Auto-Grading Complete",
                    "Your responses have been auto-graded. Check your results.",
                    NotificationChannel.IN_APP, SOURCE_GRADING, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notification.setQuizId(quizId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, quizId);
            log.info("Created GRADING_COMPLETED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate GRADING_COMPLETED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onAutoGradingFailed(String sourceEventId, UUID userId, UUID sessionId, UUID quizId, String reason) {
        try {
            Notification notification = new Notification(
                    userId, NotificationType.AUTO_GRADING_FAILED,
                    "Auto-Grading Failed",
                    "Auto-grading failed: " + reason + ". Manual review may be required.",
                    NotificationChannel.IN_APP, SOURCE_GRADING, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notification.setQuizId(quizId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, quizId);
            log.info("Created AUTO_GRADING_FAILED notification for user {}", userId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate AUTO_GRADING_FAILED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void onTranscriptGenerationFailed(String sourceEventId, UUID teacherId, UUID sessionId, String reason) {
        try {
            Notification notification = new Notification(
                    teacherId, NotificationType.TRANSCRIPT_GENERATION_FAILED,
                    "Transcript Failed",
                    "Transcript generation failed: " + reason + ". Recording may need to be re-uploaded.",
                    NotificationChannel.IN_APP, SOURCE_TRANSCRIPTION, UUID.fromString(sourceEventId));
            notification.setSessionId(sessionId);
            notificationRepository.save(notification);
            notification.markDelivered();
            notificationRepository.save(notification);
            deliverToOtherChannels(notification, sessionId, null);
            log.info("Created TRANSCRIPT_GENERATION_FAILED notification for teacher {}", teacherId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Duplicate TRANSCRIPT_GENERATION_FAILED event {} ignored", sourceEventId);
        }
    }

    @Transactional
    public void retryNotification(UUID notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> com.spandan.notification.domain.exception.NotificationException.notFound(notificationId));

        if (notification.getStatus() != com.spandan.notification.domain.enums.NotificationStatus.FAILED) {
            throw com.spandan.notification.domain.exception.NotificationException.cannotRetry(notificationId);
        }

        notification.resetForRetry();
        notificationRepository.save(notification);

        deliverToChannels(notification);
    }

    @Transactional
    public void processRetry(Notification notification) {
        ChannelDeliveryResult result = channelRouter.deliver(notification, getPreferences(notification.getUserId()));

        if (result.isSuccess()) {
            notification.markDelivered();
            notificationRepository.save(notification);
            log.info("Retry succeeded for notification {}", notification.getId());
        } else {
            notification.markFailed(result.getErrorMessage());
            if (notification.getRetryCount() < MAX_RETRIES) {
                long delay = (long) Math.pow(2, notification.getRetryCount()) * 5;
                notification.scheduleRetry(delay);
            }
            notificationRepository.save(notification);
            log.warn("Retry {} failed for notification {}: {}", notification.getRetryCount(), notification.getId(), result.getErrorMessage());
        }
    }

    private void deliverToChannels(Notification notification) {
        UserNotificationPreference prefs = getPreferences(notification.getUserId());
        ChannelDeliveryResult result = channelRouter.deliver(notification, prefs);
        if (!result.isSuccess()) {
            notification.markFailed(result.getErrorMessage());
            long delay = (long) Math.pow(2, notification.getRetryCount()) * 5;
            notification.scheduleRetry(delay);
        } else {
            notification.markDelivered();
        }
        notificationRepository.save(notification);
    }

    private void deliverToOtherChannels(Notification notification, UUID sessionId, UUID quizId) {
        UserNotificationPreference prefs = getPreferences(notification.getUserId());
        channelRouter.deliverAsync(notification, prefs, sessionId, quizId);
    }

    private UserNotificationPreference getPreferences(UUID userId) {
        return preferenceRepository.findByUserId(userId)
                .orElseGet(() -> preferenceRepository.save(new UserNotificationPreference(userId)));
    }
}
