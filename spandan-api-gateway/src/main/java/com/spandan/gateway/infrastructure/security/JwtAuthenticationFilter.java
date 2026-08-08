package com.spandan.gateway.infrastructure.security;

import com.spandan.gateway.infrastructure.error.ErrorEnvelope;
import com.spandan.gateway.infrastructure.error.ErrorResponseWriter;
import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import io.jsonwebtoken.Claims;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Optional;

/**
 * Authentication filter. Runs at order 100 — after {@link com.spandan.gateway.infrastructure.logging.CorrelationIdFilter}
 * (which ensures the correlation id is set) and before {@link RoleAuthorizationFilter}.
 *
 * <p>Behavior:
 * <ol>
 *   <li>Skip authentication for public endpoints (see {@link PublicEndpointPredicate}).</li>
 *   <li>Extract {@code Authorization: Bearer <jwt>}.</li>
 *   <li>Verify signature, expiry, and basic claim shape locally — no network call.</li>
 *   <li>Resolve the role claim. If the role is missing or unrecognized, treat as authentication
 *       failure (401). The Gateway is enumerative: unknown role strings are not coerced.</li>
 *   <li>Persist {@code Claims}, {@code Role}, and user id on the exchange for downstream filters
 *       ({@link RoleAuthorizationFilter}, {@link HeaderInjectionFilter}, structured logging).</li>
 *   <li>On failure, short-circuit with a JSON {@link ErrorEnvelope} and HTTP 401.</li>
 * </ol>
 */
@Component
@Order(100)
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtUtil jwtUtil;
    private final PublicEndpointPredicate publicEndpoints;
    private final ErrorResponseWriter errorWriter;

    public JwtAuthenticationFilter(JwtUtil jwtUtil,
                                   PublicEndpointPredicate publicEndpoints,
                                   ErrorResponseWriter errorWriter) {
        this.jwtUtil = jwtUtil;
        this.publicEndpoints = publicEndpoints;
        this.errorWriter = errorWriter;
    }

    @Override
    public int getOrder() {
        return 100;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        HttpMethod method = request.getMethod();
        String path = request.getURI().getPath();

        // Public endpoints bypass auth entirely.
        if (publicEndpoints.isPublic(method, path)) {
            return chain.filter(exchange);
        }

        String token = extractBearerToken(request);
        if (token == null) {
            return unauthorized(exchange, "missing_token", "Authorization header missing or malformed");
        }

        Optional<Claims> parsed = jwtUtil.parse(token);
        if (parsed.isEmpty()) {
            return unauthorized(exchange, "invalid_token", "JWT signature invalid, expired, or malformed");
        }
        Claims claims = parsed.get();

        String userId = jwtUtil.userId(claims);
        if (userId == null || userId.isBlank()) {
            return unauthorized(exchange, "invalid_token", "Token has no subject (user id) claim");
        }

        Role role = jwtUtil.role(claims);
        if (role == null) {
            return unauthorized(exchange, "invalid_token",
                    "Token role claim missing or not in recognized set (ADMIN, TEACHER, STUDENT)");
        }

        // Persist on exchange for downstream filters.
        exchange.getAttributes().put(ServerWebExchangeAttributes.JWT_CLAIMS, claims);
        exchange.getAttributes().put(ServerWebExchangeAttributes.ROLE, role);
        exchange.getAttributes().put(ServerWebExchangeAttributes.USER_ID, userId);

        return chain.filter(exchange);
    }

    private String extractBearerToken(ServerHttpRequest request) {
        String header = request.getHeaders().getFirst(GatewayHeaders.AUTHORIZATION);
        if (header == null) {
            return null;
        }
        header = header.trim();
        if (!header.regionMatches(true, 0, GatewayHeaders.BEARER_PREFIX, 0,
                GatewayHeaders.BEARER_PREFIX.length())) {
            return null;
        }
        String token = header.substring(GatewayHeaders.BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String code, String message) {
        String path = exchange.getRequest().getURI().getPath();
        String correlationId = ServerWebExchangeAttributes.correlationId(exchange);
        ErrorEnvelope envelope = ErrorEnvelope.of(code, message, 401, path, correlationId);
        return errorWriter.write(exchange.getResponse(), HttpStatus.UNAUTHORIZED, envelope);
    }
}