package com.spandan.gateway.infrastructure.logging;

import com.spandan.gateway.infrastructure.security.Role;
import io.jsonwebtoken.Claims;
import org.springframework.web.server.ServerWebExchange;

import java.util.UUID;

/**
 * Helpers for storing / retrieving per-request values on a {@link ServerWebExchange}'s
 * attribute map. Centralized here so the names cannot drift between filters.
 */
public final class ServerWebExchangeAttributes {

    /** Per-request correlation id, generated at the edge if absent. */
    public static final String CORRELATION_ID = "gateway.correlationId";

    /** Parsed JWT claims, populated by {@code JwtAuthenticationFilter}. May be {@code null}. */
    public static final String JWT_CLAIMS = "gateway.jwtClaims";

    /** Resolved role, populated by {@code JwtAuthenticationFilter}. May be {@code null}. */
    public static final String ROLE = "gateway.role";

    /** Resolved user id, populated by {@code JwtAuthenticationFilter}. May be {@code null}. */
    public static final String USER_ID = "gateway.userId";

    /** Marked when the request was rate-limited at the gateway level. */
    public static final String RATE_LIMITED = "gateway.rateLimited";

    private ServerWebExchangeAttributes() { /* constants only */ }

    public static String correlationId(ServerWebExchange exchange) {
        Object value = exchange.getAttribute(CORRELATION_ID);
        return value == null ? "-" : value.toString();
    }

    public static Claims jwtClaims(ServerWebExchange exchange) {
        return exchange.getAttribute(JWT_CLAIMS);
    }

    public static Role role(ServerWebExchange exchange) {
        Object value = exchange.getAttribute(ROLE);
        return value == null ? null : (Role) value;
    }

    public static String userId(ServerWebExchange exchange) {
        Object value = exchange.getAttribute(USER_ID);
        return value == null ? "-" : value.toString();
    }

    public static String newCorrelationId() {
        return "req-" + UUID.randomUUID().toString().replace("-", "");
    }
}