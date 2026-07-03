package com.spandan.gateway.infrastructure.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class RateLimiterFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterFilter.class);

    private static final int USER_LIMIT = 100;
    private static final int IP_LIMIT = 1000;
    private static final long WINDOW_SECONDS = 60;

    private final RedisRateLimiter redisRateLimiter;
    private final LocalRateLimiter localRateLimiter;

    private volatile boolean redisAvailable = true;

    public RateLimiterFilter(RedisRateLimiter redisRateLimiter, LocalRateLimiter localRateLimiter) {
        this.redisRateLimiter = redisRateLimiter;
        this.localRateLimiter = localRateLimiter;
    }

    @Override
    public int getOrder() {
        return -50;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
        String clientIp = exchange.getRequest().getRemoteAddress() != null
                ? exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
                : "unknown";

        String userKey = "rate_limit:user:" + (userId != null ? userId : "anonymous");
        String ipKey = "rate_limit:ip:" + clientIp;

        if (redisAvailable) {
            return rateLimiterFilter(exchange, chain, userKey, ipKey);
        }

        return localLimiterFilter(exchange, chain, userKey, ipKey);
    }

    private Mono<Void> rateLimiterFilter(ServerWebExchange exchange, GatewayFilterChain chain,
                                          String userKey, String ipKey) {
        return redisRateLimiter.tryAcquire(ipKey, IP_LIMIT, WINDOW_SECONDS)
                .flatMap(ipAllowed -> {
                    if (!ipAllowed) {
                        return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "Too many requests from your IP. Please retry later."));
                    }
                    return redisRateLimiter.tryAcquire(userKey, USER_LIMIT, WINDOW_SECONDS);
                })
                .flatMap(userAllowed -> {
                    if (!userAllowed) {
                        return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "Too many requests. Please retry later."));
                    }
                    return chain.filter(exchange);
                })
                .onErrorResume(e -> {
                    if (e instanceof ResponseStatusException) {
                        return Mono.error(e);
                    }
                    log.warn("Redis rate limiter error, falling back to local: {}", e.getMessage());
                    redisAvailable = false;
                    return localLimiterFilter(exchange, chain, userKey, ipKey);
                });
    }

    private Mono<Void> localLimiterFilter(ServerWebExchange exchange, GatewayFilterChain chain,
                                           String userKey, String ipKey) {
        if (!localRateLimiter.tryAcquire(ipKey, IP_LIMIT * 2, WINDOW_SECONDS)) {
            return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests from your IP. Please retry later."));
        }
        if (!localRateLimiter.tryAcquire(userKey, USER_LIMIT * 2, WINDOW_SECONDS)) {
            return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests. Please retry later."));
        }
        return chain.filter(exchange);
    }

}
