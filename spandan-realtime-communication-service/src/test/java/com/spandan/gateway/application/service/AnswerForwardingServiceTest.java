package com.spandan.gateway.application.service;

import com.spandan.gateway.domain.exception.GatewayException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnswerForwardingServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private AnswerForwardingService service;

    @BeforeEach
    void setUp() {
        service = new AnswerForwardingService(restTemplate, "http://localhost:8084");
    }

    @Test
    void shouldForwardAnswerSuccessfully() {
        ResponseEntity<Void> response = ResponseEntity.ok().build();
        when(restTemplate.exchange(
                eq("http://localhost:8084/api/responses/submit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(Void.class)
        )).thenReturn(response);

        service.forwardAnswer("user1", "quiz1", "q1", "A", "idem1");
    }

    @Test
    void shouldThrowWhenResponseServiceUnreachable() {
        when(restTemplate.exchange(
                eq("http://localhost:8084/api/responses/submit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(Void.class)
        )).thenThrow(new RuntimeException("Connection refused"));

        assertThrows(GatewayException.class, () ->
                service.forwardAnswer("user1", "quiz1", "q1", "A", "idem1"));
    }

    @Test
    void shouldThrowOnNonSuccessStatus() {
        ResponseEntity<Void> response = ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        when(restTemplate.exchange(
                eq("http://localhost:8084/api/responses/submit"),
                eq(HttpMethod.POST),
                any(HttpEntity.class),
                eq(Void.class)
        )).thenReturn(response);

        assertThrows(GatewayException.class, () ->
                service.forwardAnswer("user1", "quiz1", "q1", "A", "idem1"));
    }
}
