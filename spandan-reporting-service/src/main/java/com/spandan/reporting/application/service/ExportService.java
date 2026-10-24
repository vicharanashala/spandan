package com.spandan.reporting.application.service;

import com.spandan.reporting.domain.entity.ExportJob;
import com.spandan.reporting.domain.entity.Report;
import com.spandan.reporting.domain.enums.ExportFormat;
import com.spandan.reporting.domain.enums.ExportJobStatus;
import com.spandan.reporting.infrastructure.persistence.ExportJobRepository;
import com.spandan.reporting.infrastructure.persistence.ReportRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ExportService {

    private static final Logger log = LoggerFactory.getLogger(ExportService.class);

    private final ExportJobRepository exportJobRepository;
    private final ReportRepository reportRepository;
    private final ReportService reportService;

    @Value("${reporting.export.storage-path:exports}")
    private String storagePath;

    public ExportService(ExportJobRepository exportJobRepository, ReportRepository reportRepository,
                         ReportService reportService) {
        this.exportJobRepository = exportJobRepository;
        this.reportRepository = reportRepository;
        this.reportService = reportService;
    }

    public void preGenerateExports(String sessionIdStr) {
        List<Report> reports = reportRepository.findBySessionId(UUID.fromString(sessionIdStr));
        for (Report report : reports) {
            for (ExportFormat format : ExportFormat.values()) {
                Optional<ExportJob> existing = exportJobRepository.findBySessionIdAndFormat(
                        UUID.fromString(sessionIdStr), format.name());
                if (existing.isEmpty()) {
                    ExportJob job = new ExportJob(report.getId(), report.getSessionId(), format.name());
                    exportJobRepository.save(job);
                    generateExportAsync(job.getId().toString(), sessionIdStr, format.name(), report.getAnalyticsType());
                }
            }
        }
    }

    public ExportJob generateExport(String sessionIdStr, String formatStr) {
        ExportFormat format;
        try {
            format = ExportFormat.valueOf(formatStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }

        Optional<ExportJob> existing = exportJobRepository.findBySessionIdAndFormat(
                UUID.fromString(sessionIdStr), format.name());
        if (existing.isPresent()) {
            return existing.get();
        }

        List<Report> reports = reportRepository.findBySessionId(UUID.fromString(sessionIdStr));
        if (reports.isEmpty()) {
            return null;
        }

        ExportJob job = new ExportJob(reports.get(0).getId(), UUID.fromString(sessionIdStr), format.name());
        exportJobRepository.save(job);

        generateExportAsync(job.getId().toString(), sessionIdStr, format.name(), null);
        return job;
    }

    @Async
    public void generateExportAsync(String jobIdStr, String sessionIdStr, String format, String analyticsTypeFilter) {
        UUID jobId = UUID.fromString(jobIdStr);
        Optional<ExportJob> jobOpt = exportJobRepository.findById(jobId);
        if (jobOpt.isEmpty()) {
            log.warn("ExportJob {} not found for async generation", jobId);
            return;
        }

        ExportJob job = jobOpt.get();
        job.setStatus(ExportJobStatus.GENERATING.name());
        exportJobRepository.save(job);

        try {
            List<Report> reports = reportRepository.findBySessionId(UUID.fromString(sessionIdStr));
            String data = switch (format.toUpperCase()) {
                case "CSV" -> generateCsv(sessionIdStr, reports);
                case "PDF" -> generatePdf(sessionIdStr, reports);
                case "HTML" -> generateHtml(sessionIdStr, reports);
                default -> throw new IllegalArgumentException("Unsupported format: " + format);
            };

            Path outputPath = Path.of(storagePath, "session_" + sessionIdStr + "." + format.toLowerCase());
            File outputFile = outputPath.toFile();
            outputFile.getParentFile().mkdirs();
            java.nio.file.Files.writeString(outputPath, data, StandardCharsets.UTF_8);

            job.setFilePath(outputPath.toString());
            job.setStatus(ExportJobStatus.COMPLETED.name());
            job.setCompletedAt(Instant.now());
            exportJobRepository.save(job);
            log.info("Export generated: {} for session {}", outputPath, sessionIdStr);
        } catch (Exception e) {
            log.error("Export generation failed for session {} format {}: {}", sessionIdStr, format, e.getMessage());
            job.setStatus(ExportJobStatus.FAILED.name());
            job.setErrorMessage(e.getMessage());
            job.setCompletedAt(Instant.now());
            exportJobRepository.save(job);
        }
    }

    public Map<String, Object> getExportStatus(String sessionIdStr, String formatStr) {
        Optional<ExportJob> jobOpt = exportJobRepository.findBySessionIdAndFormat(
                UUID.fromString(sessionIdStr), formatStr.toUpperCase());
        if (jobOpt.isEmpty()) {
            Map<String, Object> notFound = new java.util.HashMap<>();
            notFound.put("status", "NOT_FOUND");
            notFound.put("sessionId", sessionIdStr);
            notFound.put("format", formatStr);
            return notFound;
        }

        ExportJob job = jobOpt.get();
        Map<String, Object> status = new java.util.HashMap<>();
        status.put("id", job.getId().toString());
        status.put("sessionId", job.getSessionId().toString());
        status.put("format", job.getFormat());
        status.put("status", job.getStatus());
        status.put("requestedAt", job.getRequestedAt().toString());
        if (job.getCompletedAt() != null) {
            status.put("completedAt", job.getCompletedAt().toString());
        }
        if (job.getFilePath() != null) {
            status.put("filePath", job.getFilePath());
        }
        if (job.getErrorMessage() != null) {
            status.put("errorMessage", job.getErrorMessage());
        }
        return status;
    }

    private String generateCsv(String sessionIdStr, List<Report> reports) throws IOException {
        StringWriter sw = new StringWriter();
        CSVPrinter printer = new CSVPrinter(sw, CSVFormat.DEFAULT.builder()
                .setHeader("SessionId", "AnalyticsType", "GeneratedAt", "Status", "Version", "Size").build());
        for (Report report : reports) {
            printer.printRecord(
                    report.getSessionId().toString(),
                    report.getAnalyticsType(),
                    report.getGeneratedAt().toString(),
                    report.getStatus(),
                    report.getVersion(),
                    report.getSize()
            );
        }
        printer.flush();
        return sw.toString();
    }

    private String generatePdf(String sessionIdStr, List<Report> reports) throws Exception {
        StringWriter sw = new StringWriter();
        sw.write("=== Spandan Report - Session " + sessionIdStr + " ===\n\n");
        for (Report report : reports) {
            sw.write("Analytics Type: " + report.getAnalyticsType() + "\n");
            sw.write("Generated At: " + report.getGeneratedAt() + "\n");
            sw.write("Status: " + report.getStatus() + "\n");
            sw.write("Version: " + report.getVersion() + "\n\n");
        }
        return sw.toString();
    }

    private String generateHtml(String sessionIdStr, List<Report> reports) {
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html><html><head><title>Session Report - ")
            .append(sessionIdStr)
            .append("</title></head><body>")
            .append("<h1>Session Report: ").append(sessionIdStr).append("</h1>")
            .append("<table border='1'><tr><th>AnalyticsType</th><th>GeneratedAt</th><th>Status</th><th>Version</th></tr>");
        for (Report report : reports) {
            html.append("<tr>")
                .append("<td>").append(report.getAnalyticsType()).append("</td>")
                .append("<td>").append(report.getGeneratedAt()).append("</td>")
                .append("<td>").append(report.getStatus()).append("</td>")
                .append("<td>").append(report.getVersion()).append("</td>")
                .append("</tr>");
        }
        html.append("</table></body></html>");
        return html.toString();
    }
}
