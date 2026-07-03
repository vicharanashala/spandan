package com.spandan.analytics.application.service;

import com.spandan.analytics.domain.exception.AnalyticsException;
import com.spandan.analytics.infrastructure.kafka.producers.AnalyticsEventProducer;
import com.spandan.analytics.infrastructure.rest.ResponseServiceRestClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AnalyticsOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsOrchestrator.class);

    private final ResponseServiceRestClient responseClient;
    private final AnalyticsComputationService computationService;
    private final AnalyticsEventProducer eventProducer;

    public AnalyticsOrchestrator(ResponseServiceRestClient responseClient,
                                 AnalyticsComputationService computationService,
                                 AnalyticsEventProducer eventProducer) {
        this.responseClient = responseClient;
        this.computationService = computationService;
        this.eventProducer = eventProducer;
    }

    public void processQuizCompleted(UUID quizId) {
        log.info("Processing QuizCompleted for quizId={}", quizId);

        try {
            List<Map<String, Object>> responses = responseClient.fetchSessionResponses(quizId);

            if (responses == null || responses.isEmpty()) {
                log.warn("No responses returned for quizId={}", quizId);
            }

            computationService.computeAnalytics(quizId, responses);

            eventProducer.publishAnalyticsCompleted(quizId);
            eventProducer.publishLeaderboardGenerated(quizId);
            eventProducer.publishStudentAnalyticsReady(quizId);
            eventProducer.publishTeacherAnalyticsReady(quizId);

            log.info("Analytics processing complete for quizId={}", quizId);
        } catch (Exception e) {
            log.error("Failed to process analytics for quizId={}: {}", quizId, e.getMessage());
            throw new AnalyticsException("Analytics processing failed: " + e.getMessage(), 500);
        }
    }
}
