package com.spandan.gateway.infrastructure.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * Fallback controller for circuit breaker triggered requests.
 *
 * <p>Routes forward to {@code /fallback/service_unavailable} when the upstream service's
 * circuit breaker is open. The response shape is the standard {@link ErrorEnvelope}.
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    @GetMapping("/service_unavailable")
    public Mono<ResponseEntity<ErrorEnvelope>> serviceUnavailable(ServerHttpRequest request) {
        String path = request.getURI().getPath();
        String correlationId = request.getHeaders().getFirst("X-Correlation-Id");
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = "-";
        }
        ErrorEnvelope envelope = new ErrorEnvelope(
                "service_unavailable",
                "Downstream service is temporarily unavailable; circuit breaker is open",
                HttpStatus.SERVICE_UNAVAILABLE.value(),
                Instant.now(),
                path,
                correlationId,
                30
        );
        return Mono.just(ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(envelope));
    }
}