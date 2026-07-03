package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.exception.GatewayException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class AnswerForwardingService {

    private final RestTemplate restTemplate;
    private final String responseServiceUrl;

    public AnswerForwardingService(RestTemplate restTemplate,
                                   @Value("${response.service.url}") String responseServiceUrl) {
        this.restTemplate = restTemplate;
        this.responseServiceUrl = responseServiceUrl;
    }

    public void forwardAnswer(String userId, String quizId, String questionId,
                              String answer, String idempotencyKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
                "userId", userId,
                "quizId", quizId,
                "questionId", questionId,
                "answer", answer,
                "idempotencyKey", idempotencyKey
        );

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Void> response = restTemplate.exchange(
                    responseServiceUrl + "/api/responses/submit",
                    HttpMethod.POST,
                    request,
                    Void.class
            );
            if (response.getStatusCode() != HttpStatus.OK && response.getStatusCode() != HttpStatus.CREATED) {
                throw GatewayException.serviceUnavailable("Response service rejected submission");
            }
        } catch (GatewayException e) {
            throw e;
        } catch (Exception e) {
            throw GatewayException.serviceUnavailable("Response service unreachable: " + e.getMessage());
        }
    }
}
