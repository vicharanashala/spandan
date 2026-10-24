package com.spandan.analytics.application.service.intelligence.impl;

import com.spandan.analytics.domain.entity.EngagementMetrics;
import com.spandan.analytics.domain.entity.feature.EducationalFeatures;
import com.spandan.analytics.domain.entity.feature.StudentFeatures;
import com.spandan.analytics.domain.intelligence.EducationalIntelligenceModule;
import com.spandan.analytics.domain.intelligence.IntelligenceResult;
import com.spandan.analytics.infrastructure.persistence.EngagementMetricsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class EngagementEstimationImpl implements EducationalIntelligenceModule {

    private static final Logger log = LoggerFactory.getLogger(EngagementEstimationImpl.class);

    private final EngagementMetricsRepository engagementRepo;

    public EngagementEstimationImpl(EngagementMetricsRepository engagementRepo) {
        this.engagementRepo = engagementRepo;
    }

    @Override
    public String getModuleName() {
        return "EngagementEstimation";
    }

    @Override
    public IntelligenceResult analyze(UUID sessionId,
                                       List<StudentFeatures> studentFeatures,
                                       List<EducationalFeatures> educationalFeatures) {
        Map<String, Object> results = new HashMap<>();
        List<Map<String, Object>> studentEngagements = new ArrayList<>();
        int highCount = 0, mediumCount = 0, lowCount = 0;

        for (StudentFeatures sf : studentFeatures) {
            BigDecimal participationRate = sf.getParticipationRate();
            BigDecimal timeoutRate = sf.getTimeoutPercentage();
            BigDecimal rtConsistency = sf.getResponseTimeConsistency();

            String engagementLevel;
            if (participationRate.compareTo(BigDecimal.valueOf(80)) >= 0
                    && timeoutRate.compareTo(BigDecimal.valueOf(10)) < 0
                    && rtConsistency.compareTo(BigDecimal.valueOf(70)) < 0) {
                engagementLevel = "HIGH";
            } else if (participationRate.compareTo(BigDecimal.valueOf(50)) >= 0
                    && timeoutRate.compareTo(BigDecimal.valueOf(25)) < 0) {
                engagementLevel = "MEDIUM";
            } else {
                engagementLevel = "LOW";
            }

            switch (engagementLevel) {
                case "HIGH" -> highCount++;
                case "MEDIUM" -> mediumCount++;
                default -> lowCount++;
            }

            Map<String, Object> studentResult = new HashMap<>();
            studentResult.put("studentId", sf.getStudentId().toString());
            studentResult.put("engagementLevel", engagementLevel);
            studentResult.put("participationRate", participationRate);
            studentResult.put("timeoutRate", timeoutRate);
            studentResult.put("responseTimeConsistency", rtConsistency);
            studentEngagements.add(studentResult);
        }

        results.put("sessionId", sessionId.toString());
        results.put("module", getModuleName());
        results.put("studentEngagements", studentEngagements);
        results.put("summary", Map.of(
                "totalStudents", studentFeatures.size(),
                "highEngagement", highCount,
                "mediumEngagement", mediumCount,
                "lowEngagement", lowCount
        ));

        log.info("Engagement estimation for sessionId={}: H={} M={} L={}",
                sessionId, highCount, mediumCount, lowCount);

        return new IntelligenceResult(getModuleName(), results);
    }
}
