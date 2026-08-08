package com.spandan.reporting.application.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class RetentionService {

    private static final Logger log = LoggerFactory.getLogger(RetentionService.class);

    private final ReportService reportService;

    @Value("${reporting.retention-days:90}")
    private int retentionDays;

    public RetentionService(ReportService reportService) {
        this.reportService = reportService;
    }

    @Scheduled(cron = "0 0 3 * * ?")
    public void scheduledRetentionSweep() {
        log.info("Starting scheduled retention sweep for reports older than {} days", retentionDays);
        reportService.deleteReportsOlderThan(retentionDays);
    }
}
