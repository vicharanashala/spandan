package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.exception.GatewayException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
public class WebSocketHandshakeService {

    private final RestTemplate restTemplate;
    private final String authServiceUrl;

    public WebSocketHandshakeService(RestTemplate restTemplate,
                                     @Value("${auth.service.url}") String authServiceUrl) {
        this.restTemplate = restTemplate;
        this.authServiceUrl = authServiceUrl;
    }

    public Map<String, Object> validateToken(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        HttpEntity<Void> request = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    authServiceUrl + "/api/auth/validate",
                    HttpMethod.GET,
                    request,
                    Map.class
            );
            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                throw GatewayException.unauthorized("Token validation failed");
            }
            return response.getBody();
        } catch (Exception e) {
            throw GatewayException.serviceUnavailable("Auth service unreachable: " + e.getMessage());
        }
    }
}
