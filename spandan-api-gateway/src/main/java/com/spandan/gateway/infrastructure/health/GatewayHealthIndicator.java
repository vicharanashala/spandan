package com.spandan.gateway.infrastructure.health;

import com.spandan.gateway.infrastructure.ratelimit.RedisRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.ReactiveHealthIndicator;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class GatewayHealthIndicator implements ReactiveHealthIndicator {

    private static final Logger log = LoggerFactory.getLogger(GatewayHealthIndicator.class);

    private final RedisRateLimiter redisRateLimiter;

    public GatewayHealthIndicator(RedisRateLimiter redisRateLimiter) {
        this.redisRateLimiter = redisRateLimiter;
    }

    @Override
    public Mono<Health> health() {
        return redisRateLimiter.ping()
                .map(available -> {
                    if (available) {
                        return Health.up().withDetail("redis", "available").build();
                    }
                    return Health.up().withDetail("redis", "unavailable (local fallback active)").build();
                })
                .onErrorReturn(Health.up().withDetail("redis", "unavailable (local fallback active)").build());
    }

}
