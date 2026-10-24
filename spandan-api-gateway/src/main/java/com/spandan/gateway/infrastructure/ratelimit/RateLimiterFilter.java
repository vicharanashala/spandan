package com.spandan.gateway.infrastructure.ratelimit;

import com.spandan.gateway.infrastructure.error.ErrorEnvelope;
import com.spandan.gateway.infrastructure.error.ErrorResponseWriter;
import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Local fallback rate-limit GlobalFilter.
 *
 * <p>The primary rate-limiting is performed by Spring Cloud Gateway's built-in
 * {@code RequestRateLimiter} (Redis-backed), configured in {@code application.yml}.
 * This filter is the LOCAL second-line defense — when Redis is unhealthy, this filter
 * continues to enforce a per-principal cap so the gateway cannot be used as a DOS amplifier.
 *
 * <p>Runs after authentication (order 300) so the principal key can be derived from the
 * resolved user id.
 */
@Component
@Order(300)
public class RateLimiterFilter implements GlobalFilter, Ordered {

    private final LocalRateLimiter localRateLimiter;
    private final ErrorResponseWriter errorWriter;

    public RateLimiterFilter(LocalRateLimiter localRateLimiter, ErrorResponseWriter errorWriter) {
        this.localRateLimiter = localRateLimiter;
        this.errorWriter = errorWriter;
    }

    @Override
    public int getOrder() {
        return 300;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String userId = ServerWebExchangeAttributes.userId(exchange);
        String principalKey = userId == null || "-".equals(userId) ? ipKey(request) : "user:" + userId;

        if (!localRateLimiter.tryAcquire(principalKey)) {
            exchange.getAttributes().put(ServerWebExchangeAttributes.RATE_LIMITED, Boolean.TRUE);
            String path = request.getURI().getPath();
            String correlationId = ServerWebExchangeAttributes.correlationId(exchange);
            ErrorEnvelope envelope = ErrorEnvelope
                    .of("rate_limited", "Too many requests; retry after a short backoff", 429, path, correlationId)
                    .withRetryAfter(1);
            return errorWriter.write(exchange.getResponse(), HttpStatus.TOO_MANY_REQUESTS, envelope);
        }
        return chain.filter(exchange);
    }

    private String ipKey(ServerHttpRequest request) {
        String forwarded = request.getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return "ip:" + (comma > 0 ? forwarded.substring(0, comma).trim() : forwarded.trim());
        }
        if (request.getRemoteAddress() != null && request.getRemoteAddress().getAddress() != null) {
            return "ip:" + request.getRemoteAddress().getAddress().getHostAddress();
        }
        return "ip:unknown";
    }
}