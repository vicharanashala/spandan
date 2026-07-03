package com.spandan.gateway.infrastructure.security;

import io.jsonwebtoken.Claims;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Set;

@Component
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {

    private static final String BEARER_PREFIX = "Bearer ";

    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/health",
            "/actuator/health",
            "/actuator/info"
    );

    private static final Set<String> TEACHER_ONLY_PREFIXES = Set.of(
            "/api/v1/questions/",
            "/api/v1/reviews/"
    );

    private static final Set<String> TEACHER_ADMIN_PREFIXES = Set.of(
            "/api/v1/streams/",
            "/api/v1/transcripts/"
    );

    private static final Set<String> TEACHER_WRITE_PATHS = Set.of(
            "/api/v1/polls/",
            "/api/v1/analytics/"
    );

    private final JwtUtil jwtUtil;

    public JwtAuthenticationFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public int getOrder() {
        return -100;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        if (isPublicPath(path)) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing or invalid Authorization header"));
        }

        String token = authHeader.substring(BEARER_PREFIX.length());

        Claims claims;
        try {
            claims = jwtUtil.validateAndParse(token);
        } catch (Exception e) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token"));
        }

        String userId = claims.getSubject();
        String role = claims.get("role", String.class);

        if (userId == null || role == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token missing required claims"));
        }

        if (!isAuthorized(path, exchange.getRequest().getMethod().name(), role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Insufficient permissions. Required role: " + getRequiredRole(path)));
        }

        String method = exchange.getRequest().getMethod().name();

        exchange = exchange.mutate()
                .request(r -> r.header("X-User-Id", userId)
                        .header("X-Role", role)
                        .header("X-Forwarded-Method", method))
                .build();

        return chain.filter(exchange);
    }

    private boolean isPublicPath(String path) {
        if (PUBLIC_PATHS.contains(path)) {
            return true;
        }
        if (path.startsWith("/actuator/") && !path.equals("/actuator/prometheus")) {
            return true;
        }
        return false;
    }

    private boolean isAuthorized(String path, String method, String role) {
        if ("ADMIN".equals(role)) {
            return true;
        }

        for (String prefix : TEACHER_ONLY_PREFIXES) {
            if (path.startsWith(prefix)) {
                return "TEACHER".equals(role);
            }
        }

        for (String prefix : TEACHER_ADMIN_PREFIXES) {
            if (path.startsWith(prefix)) {
                return "TEACHER".equals(role);
            }
        }

        for (String prefix : TEACHER_WRITE_PATHS) {
            if (path.startsWith(prefix) && !"GET".equalsIgnoreCase(method)) {
                return "TEACHER".equals(role);
            }
        }

        return "TEACHER".equals(role) || "STUDENT".equals(role);
    }

    private String getRequiredRole(String path) {
        for (String prefix : TEACHER_ONLY_PREFIXES) {
            if (path.startsWith(prefix)) return "TEACHER";
        }
        for (String prefix : TEACHER_ADMIN_PREFIXES) {
            if (path.startsWith(prefix)) return "TEACHER or ADMIN";
        }
        for (String prefix : TEACHER_WRITE_PATHS) {
            if (path.startsWith(prefix)) return "TEACHER for write";
        }
        return "TEACHER or STUDENT";
    }

}
