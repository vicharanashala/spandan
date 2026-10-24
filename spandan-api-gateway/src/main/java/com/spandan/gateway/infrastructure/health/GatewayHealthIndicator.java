package com.spandan.gateway.infrastructure.health;

import com.spandan.gateway.infrastructure.ratelimit.RedisRateLimiter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Composite health indicator that reports:
 * <ul>
 *   <li>Redis reachability (used by the rate limiter)</li>
 *   <li>Aggregate status of every circuit breaker</li>
 * </ul>
 *
 * <p>Exposed by Spring Boot Actuator at {@code /actuator/health}. K8s liveness/readiness
 * probes target {@code /actuator/health/liveness} and {@code /actuator/health/readiness}
 * via the management.endpoint.health.probes config.
 */
@Component
public class GatewayHealthIndicator implements HealthIndicator {

    private static final Logger log = LoggerFactory.getLogger(GatewayHealthIndicator.class);

    private final RedisRateLimiter redisRateLimiter;
    private final CircuitBreakerRegistry circuitBreakerRegistry;

    public GatewayHealthIndicator(RedisRateLimiter redisRateLimiter,
                                  CircuitBreakerRegistry circuitBreakerRegistry) {
        this.redisRateLimiter = redisRateLimiter;
        this.circuitBreakerRegistry = circuitBreakerRegistry;
    }

    @Override
    public Health health() {
        Health.Builder builder;
        try {
            boolean redisUp = Boolean.TRUE.equals(redisRateLimiter.ping().block());
            builder = redisUp ? Health.up() : Health.down().withDetail("redis", "ping returned non-PONG or timed out");
        } catch (Exception ex) {
            log.warn("Health check threw: {}", ex.getMessage());
            builder = Health.down().withDetail("redis_error", ex.getMessage());
        }

        Map<String, String> breakerStates = new LinkedHashMap<>();
        boolean anyOpen = false;
        for (CircuitBreaker cb : circuitBreakerRegistry.getAllCircuitBreakers()) {
            String state = cb.getState().name();
            breakerStates.put(cb.getName(), state);
            if (cb.getState() == CircuitBreaker.State.OPEN
                    || cb.getState() == CircuitBreaker.State.FORCED_OPEN) {
                anyOpen = true;
            }
        }

        if (anyOpen) {
            builder = builder.status(new Status("DEGRADED",
                    "one or more downstream service circuit breakers are open"));
        }
        return builder
                .withDetail("circuit_breakers", breakerStates)
                .build();
    }
}