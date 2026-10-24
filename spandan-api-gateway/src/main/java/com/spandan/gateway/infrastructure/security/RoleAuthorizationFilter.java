package com.spandan.gateway.infrastructure.security;

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

import java.util.Map;
import java.util.Set;

/**
 * Role-based authorization. Runs after {@link JwtAuthenticationFilter}.
 *
 * <p>For each {@code /api/v1/<service>/**} route, the gateway checks the resolved role
 * against the set of roles allowed for that path.
 *
 * <p>Default policy:
 * <pre>{@code
 * /api/v1/auth/**                → any authenticated user
 * /api/v1/admin/**               → ADMIN only
 * /api/v1/question-generation/** → TEACHER only
 * /api/v1/reviews/**             → ADMIN only
 * /api/v1/polling/**             → ADMIN only
 * /api/v1/interactions/**        → STUDENT or TEACHER or ADMIN
 * /api/v1/reports/**             → TEACHER or ADMIN
 * /api/v1/analytics/**           → TEACHER or ADMIN
 * /api/v1/transcripts/**         → TEACHER or ADMIN
 * /api/v1/streams/**             → TEACHER or ADMIN
 * /api/v1/recordings/**          → TEACHER or ADMIN
 * /api/v1/realtime/**            → any authenticated user
 * /api/v1/notifications/**       → any authenticated user
 * /api/v1/notification-preferences/** → any authenticated user
 * /api/v1/users/me               → any authenticated user
 * /api/v1/users/**               → ADMIN only
 * }</pre>
 *
 * <p>Fine-grained endpoint-level authorization (e.g., GET /current vs POST /start on
 * polling) is delegated to downstream services. The gateway enforces coarse role
 * boundaries at the path-prefix level only.
 *
 * <p>If a request reaches a route that has no rule AND is not a public endpoint, the gateway
 * DENIES the request with 403 forbidden. This is the default-deny posture.
 */
@Component
@Order(200)
public class RoleAuthorizationFilter implements GlobalFilter, Ordered {

    /** Map of path-prefix → allowed roles. Match is longest-prefix wins. */
    private static final Map<String, Set<Role>> RULES = Map.ofEntries(
            Map.entry("/api/v1/admin", Set.of(Role.ADMIN)),
            Map.entry("/api/v1/users", Set.of(Role.ADMIN)),
            Map.entry("/api/v1/reports", Set.of(Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/analytics", Set.of(Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/transcripts", Set.of(Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/streams", Set.of(Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/recordings", Set.of(Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/question-generation", Set.of(Role.TEACHER)),
            Map.entry("/api/v1/reviews", Set.of(Role.ADMIN)),
            Map.entry("/api/v1/polling", Set.of(Role.ADMIN)),
            Map.entry("/api/v1/interactions", Set.of(Role.STUDENT, Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/realtime", Set.of(Role.STUDENT, Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/notifications", Set.of(Role.STUDENT, Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/notification-preferences", Set.of(Role.STUDENT, Role.TEACHER, Role.ADMIN)),
            Map.entry("/api/v1/auth", Set.of(Role.STUDENT, Role.TEACHER, Role.ADMIN))
    );

    /** Routes explicitly allow any authenticated user, no role restriction. */
    private static final Set<String> ANY_AUTHENTICATED = Set.of(
            "/api/v1/users/me",
            "/health",
            "/actuator"
    );

    private final ErrorResponseWriter errorWriter;

    public RoleAuthorizationFilter(ErrorResponseWriter errorWriter) {
        this.errorWriter = errorWriter;
    }

    @Override
    public int getOrder() {
        return 200;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        String methodName = request.getMethod() == null ? "GET" : request.getMethod().name();

        // /users/me and /health bypass role checks (any authenticated user).
        for (String allowed : ANY_AUTHENTICATED) {
            if (path.equals(allowed) || path.startsWith(allowed + "/")) {
                return chain.filter(exchange);
            }
        }

        Set<Role> allowed = findRule(path);
        if (allowed == null) {
            // Default-deny. Anything not whitelisted is forbidden unless it is public, which
            // would have already been bypassed by JwtAuthenticationFilter.
            return forbidden(exchange, "forbidden",
                    "Route " + methodName + " " + path + " has no role policy; default-deny");
        }

        Role actual = ServerWebExchangeAttributes.role(exchange);
        if (actual == null) {
            return forbidden(exchange, "forbidden", "No role resolved for request");
        }
        if (!allowed.contains(actual)) {
            return forbidden(exchange, "forbidden",
                    "Role " + actual + " is not authorized for " + methodName + " " + path);
        }

        return chain.filter(exchange);
    }

    private Set<Role> findRule(String path) {
        Set<Role> best = null;
        int bestLen = -1;
        for (Map.Entry<String, Set<Role>> e : RULES.entrySet()) {
            String prefix = e.getKey();
            if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                if (prefix.length() > bestLen) {
                    best = e.getValue();
                    bestLen = prefix.length();
                }
            }
        }
        return best;
    }

    private Mono<Void> forbidden(ServerWebExchange exchange, String code, String message) {
        String path = exchange.getRequest().getURI().getPath();
        String correlationId = ServerWebExchangeAttributes.correlationId(exchange);
        ErrorEnvelope envelope = ErrorEnvelope.of(code, message, 403, path, correlationId);
        return errorWriter.write(exchange.getResponse(), HttpStatus.FORBIDDEN, envelope);
    }
}