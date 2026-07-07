package com.spandan.reporting.infrastructure.kafka.consumers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.reporting.application.service.ReportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class AnalyticsOutputEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsOutputEventConsumer.class);

    private final ReportService reportService;
    private final ObjectMapper objectMapper;

    public AnalyticsOutputEventConsumer(ReportService reportService, ObjectMapper objectMapper) {
        this.reportService = reportService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "analytics-output-events", groupId = "${spring.kafka.consumer.group-id}")
    public void consume(Acknowledgment ack, Map<String, Object> payload) {
        try {
            log.info("Received AnalyticsGeneratedEvent: {}", payload.get("eventId"));

            String eventId = (String) payload.get("eventId");
            String sessionId = (String) payload.get("sessionId");
            String analyticsType = (String) payload.get("analyticsType");
            String generatedAt = (String) payload.get("generatedAt");
            Object summary = payload.get("summary");
            Object analyticsData = payload.get("analyticsData");

            String summaryJson = summary != null ? objectMapper.writeValueAsString(summary) : null;
            String dataJson = analyticsData != null ? objectMapper.writeValueAsString(analyticsData) : null;

            reportService.upsertReport(sessionId, analyticsType, dataJson, summaryJson, generatedAt);

            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process AnalyticsGeneratedEvent: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }
}
