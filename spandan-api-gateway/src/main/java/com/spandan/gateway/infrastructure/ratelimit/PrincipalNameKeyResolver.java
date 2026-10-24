package com.spandan.gateway.infrastructure.ratelimit;

import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Key resolver for the Spring Cloud Gateway {@code RequestRateLimiter} filter.
 *
 * <p>Buckets keyed by:
 * <ol>
 *   <li>Authenticated user id, if the request was authenticated.</li>
 *   <li>Fallback: the client IP (from {@code X-Forwarded-For} first, then remote address).</li>
 * </ol>
 *
 * <p>This means a single authenticated user always shares ONE token bucket across all
 * downstream routes, which prevents a user from exhausting other users' allocation.
 */
@Component
public class PrincipalNameKeyResolver implements KeyResolver {

    @Override
    public Mono<String> resolve(ServerWebExchange exchange) {
        String userId = ServerWebExchangeAttributes.userId(exchange);
        if (userId != null && !"unknown".equals(userId) && !"-".equals(userId)) {
            return Mono.just("user:" + userId);
        }
        // Fall back to IP-based limiting for unauthenticated traffic (only public endpoints).
        String forwarded = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            if (comma > 0) {
                forwarded = forwarded.substring(0, comma).trim();
            } else {
                forwarded = forwarded.trim();
            }
            return Mono.just("ip:" + forwarded);
        }
        if (exchange.getRequest().getRemoteAddress() != null
                && exchange.getRequest().getRemoteAddress().getAddress() != null) {
            return Mono.just("ip:" + exchange.getRequest().getRemoteAddress().getAddress().getHostAddress());
        }
        return Mono.just("ip:unknown");
    }
}