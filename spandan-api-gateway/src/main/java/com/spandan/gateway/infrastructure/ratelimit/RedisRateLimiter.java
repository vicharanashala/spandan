package com.spandan.gateway.infrastructure.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Wrapper around the Spring Cloud Gateway built-in {@code RedisRateLimiter} filter that
 * also exposes a Redis-health ping used by {@link com.spandan.gateway.infrastructure.health.GatewayHealthIndicator}.
 *
 * <p>The actual rate-limiting is performed by Spring Cloud Gateway's {@code RequestRateLimiter}
 * GatewayFilter, which is wired by the {@code default-filters} entry in {@code application.yml}.
 * This bean exists to:
 * <ul>
 *   <li>Provide a {@code ping()} method for the health indicator.</li>
 *   <li>Surface Redis reachability to other components that may want to fall back to
 *       {@link LocalRateLimiter}.</li>
 * </ul>
 */
@Component
public class RedisRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    private final ReactiveRedisConnectionFactory connectionFactory;

    public RedisRateLimiter(ReactiveRedisConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    /**
     * Issue a PING against the configured Redis. Returns true if Redis responded with PONG
     * within 500ms, false otherwise.
     */
    public Mono<Boolean> ping() {
        return connectionFactory.getReactiveConnection()
                .ping()
                .map("PONG"::equalsIgnoreCase)
                .timeout(Duration.ofMillis(500))
                .onErrorResume(ex -> {
                    log.warn("Redis ping failed: {}", ex.getMessage());
                    return Mono.just(false);
                });
    }
}