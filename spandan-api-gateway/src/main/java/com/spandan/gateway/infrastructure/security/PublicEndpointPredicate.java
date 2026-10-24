package com.spandan.gateway.infrastructure.security;

import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Identifies public (unauthenticated) endpoints.
 *
 * <p>The gateway enforces authentication by default for all {@code /api/v1/**} routes.
 * A small set of public endpoints is hard-coded here:
 * <ul>
 *   <li>{@code GET /health}, {@code GET /actuator/health} – K8s probes</li>
 *   <li>{@code POST /api/v1/auth/login}</li>
 *   <li>{@code POST /api/v1/auth/register}</li>
 *   <li>{@code POST /api/v1/auth/refresh} – refresh is authenticated by body, not header</li>
 * </ul>
 *
 * <p>The ADMIN role addendum does not introduce any new public endpoint.
 */
@Component
public class PublicEndpointPredicate {

    /** Pattern matchers keyed by HTTP method. Order is irrelevant – we test exact path + method. */
    private static final Map<HttpMethod, List<String>> PUBLIC_PATHS = Map.of(
            HttpMethod.GET, List.of(
                    "/health",
                    "/actuator",
                    "/actuator/health",
                    "/actuator/info",
                    "/actuator/metrics",
                    "/actuator/prometheus"
            ),
            HttpMethod.POST, List.of(
                    "/api/v1/auth/login",
                    "/api/v1/auth/register",
                    "/api/v1/auth/refresh"
            )
    );

    /**
     * Returns {@code true} when the request path + method is one of the explicitly-public
     * endpoints and may bypass authentication.
     */
    public boolean isPublic(HttpMethod method, String path) {
        if (method == null || path == null) {
            return false;
        }
        List<String> allowed = PUBLIC_PATHS.get(method);
        if (allowed == null) {
            return false;
        }
        for (String candidate : allowed) {
            if (candidate.equals(path)) {
                return true;
            }
            // allow /actuator/** but only for the actuator endpoints above; the equals check above
            // handles exact-match actuator sub-paths. /actuator itself is included.
            if (candidate.endsWith("/**") && path.startsWith(candidate.substring(0, candidate.length() - 3))) {
                return true;
            }
        }
        return false;
    }
}