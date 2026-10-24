package com.spandan.reporting.infrastructure.kafka.consumers;

import com.spandan.reporting.application.service.ExportService;
import com.spandan.reporting.application.service.ReportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SessionAnalyticsEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(SessionAnalyticsEventConsumer.class);

    private final ReportService reportService;
    private final ExportService exportService;

    public SessionAnalyticsEventConsumer(ReportService reportService, ExportService exportService) {
        this.reportService = reportService;
        this.exportService = exportService;
    }

    @KafkaListener(topics = "session-analytics-events", groupId = "${spring.kafka.consumer.group-id}")
    public void consume(Acknowledgment ack, Map<String, Object> payload) {
        try {
            String sessionId = (String) payload.get("sessionId");
            String completedAt = (String) payload.get("completedAt");

            log.info("Received SessionAnalyticsCompletedEvent for session: {}", sessionId);

            reportService.markSessionCompleted(sessionId);

            exportService.preGenerateExports(sessionId);

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process SessionAnalyticsCompletedEvent: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }
}
