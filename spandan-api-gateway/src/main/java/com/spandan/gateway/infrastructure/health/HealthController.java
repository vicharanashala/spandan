package com.spandan.gateway.infrastructure.health;

import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;

/**
 * Top-level health endpoint at {@code /health}. This is the path the K8s probes use — it is
 * intentionally NOT /actuator/health because we want the gateway to remain "alive" even when
 * downstream services are degraded (the circuit breaker will handle that).
 *
 * <p>Returns:
 * <pre>{@code
 * {
 *   "status": "UP",
 *   "timestamp": "2026-07-03T11:00:00Z",
 *   "service": "spandan-api-gateway",
 *   "version": "1.0.0",
 *   "correlation_id": "req-..."
 * }
 * }</pre>
 */
@RestController
@RequestMapping("/health")
public class HealthController {

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Map<String, Object>>> health(ServerHttpRequest request) {
        Map<String, Object> body = Map.of(
                "status", "UP",
                "timestamp", Instant.now().toString(),
                "service", "spandan-api-gateway",
                "version", "1.0.0",
                "correlation_id", request.getHeaders().getFirst("X-Correlation-Id") != null
                        ? request.getHeaders().getFirst("X-Correlation-Id")
                        : ServerWebExchangeAttributes.newCorrelationId()
        );
        return Mono.just(ResponseEntity.ok(body));
    }
}