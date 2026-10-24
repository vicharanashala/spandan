package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.exception.GatewayException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;

@Service
public class AnswerForwardingService {

    private static final Logger log = LoggerFactory.getLogger(AnswerForwardingService.class);
    private final RestTemplate restTemplate;
    private final String responseServiceUrl;

    public AnswerForwardingService(RestTemplate restTemplate,
                                   @Value("${response.service.url}") String responseServiceUrl) {
        this.restTemplate = restTemplate;
        this.responseServiceUrl = responseServiceUrl;
    }

    public void forwardAnswer(String userId, String quizId, String questionId,
                              String answer, String idempotencyKey) {
        log.info("Answer submitted via Kafka for userId={}, quizId={}, questionId={}",
                userId, quizId, questionId);
    }
}
