package com.spandan.reporting.application.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.reporting.domain.entity.Report;
import com.spandan.reporting.domain.enums.ReportStatus;
import com.spandan.reporting.infrastructure.persistence.ReportRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);
    private static final String REDIS_KEY_PREFIX = "report:";
    private static final Duration REDIS_TTL = Duration.ofHours(1);

    private final ReportRepository reportRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${reporting.retention-days:90}")
    private int retentionDays;

    public ReportService(ReportRepository reportRepository, StringRedisTemplate redisTemplate,
                         ObjectMapper objectMapper) {
        this.reportRepository = reportRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void upsertReport(String sessionIdStr, String analyticsType, String reportDataJson,
                             String summaryJson, String generatedAtStr) {
        UUID sessionId = UUID.fromString(sessionIdStr);
        Instant generatedAt = Instant.parse(generatedAtStr);

        Optional<Report> existing = reportRepository.findBySessionIdAndAnalyticsType(sessionId, analyticsType);

        if (existing.isPresent()) {
            Report report = existing.get();
            if (generatedAt.isAfter(report.getGeneratedAt())) {
                report.setReportData(reportDataJson);
                report.setSummary(summaryJson);
                report.setGeneratedAt(generatedAt);
                report.setStatus(ReportStatus.COMPLETED.name());
                report.setSize(reportDataJson != null ? reportDataJson.length() : 0);
                report.incrementVersion();
                reportRepository.save(report);
                log.info("Updated report sessionId={} analyticsType={} version={}",
                        sessionId, analyticsType, report.getVersion());
            }
        } else {
            Report report = new Report(sessionId, null, analyticsType, reportDataJson,
                    summaryJson, generatedAt);
            report.setStatus(ReportStatus.COMPLETED.name());
            reportRepository.save(report);
            log.info("Created report sessionId={} analyticsType={}", sessionId, analyticsType);
        }

        cacheReport(sessionIdStr, analyticsType, reportDataJson, summaryJson);
    }

    public void markSessionCompleted(String sessionIdStr) {
        UUID sessionId = UUID.fromString(sessionIdStr);
        List<Report> reports = reportRepository.findBySessionId(sessionId);
        for (Report report : reports) {
            if (!ReportStatus.COMPLETED.name().equals(report.getStatus())) {
                report.setStatus(ReportStatus.COMPLETED.name());
                report.incrementVersion();
                reportRepository.save(report);
            }
        }
    }

    public Map<String, Object> getReportData(String sessionIdStr, String analyticsType) {
        String cacheKey = redisKey(sessionIdStr, analyticsType);
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            try {
                return objectMapper.readValue(cached, Map.class);
            } catch (JsonProcessingException e) {
                log.warn("Failed to deserialize cached report for key {}", cacheKey);
            }
        }

        UUID sessionId = UUID.fromString(sessionIdStr);
        Optional<Report> reportOpt = reportRepository.findBySessionIdAndAnalyticsType(sessionId, analyticsType);
        if (reportOpt.isEmpty()) {
            return null;
        }

        Report report = reportOpt.get();
        String dataJson = report.getReportData();
        if (dataJson == null) {
            return null;
        }

        cacheReport(sessionIdStr, analyticsType, dataJson, report.getSummary());

        try {
            return objectMapper.readValue(dataJson, Map.class);
        } catch (JsonProcessingException e) {
            log.error("Failed to deserialize report data for sessionId={} analyticsType={}", sessionId, analyticsType);
            return null;
        }
    }

    public Map<String, Object> getReportMetadata(String sessionIdStr, String analyticsType) {
        UUID sessionId = UUID.fromString(sessionIdStr);
        Optional<Report> reportOpt = reportRepository.findBySessionIdAndAnalyticsType(sessionId, analyticsType);
        if (reportOpt.isEmpty()) {
            return null;
        }
        Report report = reportOpt.get();
        Map<String, Object> metadata = new java.util.HashMap<>();
        metadata.put("sessionId", report.getSessionId().toString());
        metadata.put("analyticsType", report.getAnalyticsType());
        metadata.put("status", report.getStatus());
        metadata.put("generatedAt", report.getGeneratedAt().toString());
        metadata.put("version", report.getVersion());
        metadata.put("size", report.getSize());
        metadata.put("updatedAt", report.getUpdatedAt().toString());
        return metadata;
    }

    public Map<String, Object> getReportStatus(String sessionIdStr) {
        UUID sessionId = UUID.fromString(sessionIdStr);
        List<Report> reports = reportRepository.findBySessionId(sessionId);
        Map<String, Object> status = new java.util.HashMap<>();
        status.put("sessionId", sessionIdStr);
        status.put("availableTypes", reports.stream().map(Report::getAnalyticsType).collect(Collectors.toList()));
        status.put("total", reports.size());
        status.put("allCompleted", reports.stream().allMatch(r -> ReportStatus.COMPLETED.name().equals(r.getStatus())));
        return status;
    }

    public List<Map<String, Object>> getRecentReports(String teacherIdStr) {
        UUID teacherId = UUID.fromString(teacherIdStr);
        List<Report> reports = reportRepository.findByTeacherIdOrderByGeneratedAtDesc(teacherId);
        return reports.stream().map(r -> {
            Map<String, Object> item = new java.util.HashMap<>();
            item.put("sessionId", r.getSessionId().toString());
            item.put("analyticsType", r.getAnalyticsType());
            item.put("status", r.getStatus());
            item.put("generatedAt", r.getGeneratedAt().toString());
            item.put("size", r.getSize());
            return item;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void deleteReportsOlderThan(int days) {
        Instant cutoff = Instant.now().minus(Duration.ofDays(days));
        List<Report> reports = reportRepository.findAll();
        int deleted = 0;
        for (Report report : reports) {
            if (report.getGeneratedAt().isBefore(cutoff)) {
                reportRepository.delete(report);
                String cacheKey = redisKey(report.getSessionId().toString(), report.getAnalyticsType());
                redisTemplate.delete(cacheKey);
                deleted++;
            }
        }
        if (deleted > 0) {
            log.info("Retention sweep: deleted {} reports older than {} days", deleted, days);
        }
    }

    private void cacheReport(String sessionId, String analyticsType, String reportData, String summary) {
        String cacheKey = redisKey(sessionId, analyticsType);
        if (reportData != null) {
            redisTemplate.opsForValue().set(cacheKey, reportData, REDIS_TTL);
        }
    }

    private String redisKey(String sessionId, String analyticsType) {
        return REDIS_KEY_PREFIX + sessionId + ":" + analyticsType;
    }
}
