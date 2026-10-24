package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.exception.GatewayException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WebSocketHandshakeServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private WebSocketHandshakeService service;

    @BeforeEach
    void setUp() {
        service = new WebSocketHandshakeService(restTemplate, "http://localhost:8081");
    }

    @Test
    void shouldValidateTokenSuccessfully() {
        Map<String, Object> expected = Map.of("userId", "user1", "role", "STUDENT", "quizId", "quiz1");
        ResponseEntity<Map> response = ResponseEntity.ok(expected);
        when(restTemplate.exchange(
                eq("http://localhost:8081/api/auth/validate"),
                eq(HttpMethod.GET),
                any(HttpEntity.class),
                eq(Map.class)
        )).thenReturn(response);

        Map<String, Object> result = service.validateToken("valid-token");
        assertEquals("user1", result.get("userId"));
    }

    @Test
    void shouldThrowOnInvalidToken() {
        ResponseEntity<Map> response = ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(null);
        when(restTemplate.exchange(
                eq("http://localhost:8081/api/auth/validate"),
                eq(HttpMethod.GET),
                any(HttpEntity.class),
                eq(Map.class)
        )).thenReturn(response);

        assertThrows(GatewayException.class, () -> service.validateToken("invalid-token"));
    }

    @Test
    void shouldThrowWhenAuthServiceUnreachable() {
        when(restTemplate.exchange(
                eq("http://localhost:8081/api/auth/validate"),
                eq(HttpMethod.GET),
                any(HttpEntity.class),
                eq(Map.class)
        )).thenThrow(new RuntimeException("Connection refused"));

        assertThrows(GatewayException.class, () -> service.validateToken("any-token"));
    }
}
