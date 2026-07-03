package com.spandan.notification.application.service;

import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Component
public class RetrySweeper {

    private static final Logger log = LoggerFactory.getLogger(RetrySweeper.class);
    private static final int MAX_RETRIES = 5;
    private static final int BATCH_SIZE = 100;

    private final NotificationRepository notificationRepository;
    private final NotificationOrchestrator orchestrator;

    public RetrySweeper(NotificationRepository notificationRepository, NotificationOrchestrator orchestrator) {
        this.notificationRepository = notificationRepository;
        this.orchestrator = orchestrator;
    }

    @Scheduled(fixedDelayString = "${notification.retry.interval-ms:30000}")
    public void processRetries() {
        List<Notification> failedNotifications = notificationRepository.findNotificationsToRetry(MAX_RETRIES, Instant.now());

        if (failedNotifications.isEmpty()) {
            return;
        }

        log.info("Retry sweeper processing {} failed notifications", failedNotifications.size());

        int processed = 0;
        for (Notification notification : failedNotifications) {
            if (processed >= BATCH_SIZE) break;

            try {
                orchestrator.processRetry(notification);
                processed++;
            } catch (Exception e) {
                log.error("Error processing retry for notification {}: {}", notification.getId(), e.getMessage(), e);
            }
        }

        log.info("Retry sweeper processed {} of {} notifications", processed, failedNotifications.size());
    }
}
