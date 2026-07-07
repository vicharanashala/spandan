package com.spandan.analytics.infrastructure.rest;

import com.spandan.analytics.domain.exception.AnalyticsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class ResponseServiceRestClient {

    private static final Logger log = LoggerFactory.getLogger(ResponseServiceRestClient.class);

    private final RestTemplate restTemplate;
    private final String responseServiceUrl;

    public ResponseServiceRestClient(RestTemplate restTemplate,
                                     @Value("${response.service.url}") String responseServiceUrl) {
        this.restTemplate = restTemplate;
        this.responseServiceUrl = responseServiceUrl;
    }

    public List<Map<String, Object>> fetchSessionResponses(UUID sessionId) {
        String url = responseServiceUrl + "/api/v1/interactions/session/" + sessionId.toString() + "/analytics/raw";
        try {
            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    null,
                    new ParameterizedTypeReference<>() {}
            );
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                log.info("Fetched {} interactions for sessionId={}", response.getBody().size(), sessionId);
                return response.getBody();
            }
            throw AnalyticsException.serviceUnavailable("Response service returned " + response.getStatusCode());
        } catch (AnalyticsException e) {
            throw e;
        } catch (Exception e) {
            throw AnalyticsException.serviceUnavailable("Failed to fetch interactions: " + e.getMessage());
        }
    }
}
