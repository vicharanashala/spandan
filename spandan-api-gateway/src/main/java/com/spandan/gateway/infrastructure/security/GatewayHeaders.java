package com.spandan.gateway.infrastructure.security;

/**
 * Header names used by the Gateway — both for inbound (from clients) and outbound
 * (to downstream services).
 */
public final class GatewayHeaders {

    public static final String AUTHORIZATION = "Authorization";
    public static final String BEARER_PREFIX = "Bearer ";

    /** Header carrying the authenticated user id. Populated by {@code HeaderInjectionFilter}. */
    public static final String X_USER_ID = "X-User-Id";

    /** Header carrying the authenticated role. Value domain: ADMIN | TEACHER | STUDENT. */
    public static final String X_ROLE = "X-Role";

    /** Header carrying the per-request correlation id. Generated or accepted at the edge. */
    public static final String X_CORRELATION_ID = "X-Correlation-Id";

    /** Header carrying the upstream tracing id (kept for forward-compatibility). */
    public static final String X_TRACE_ID = "X-Trace-Id";

    /** Header carrying the client-supplied idempotency key (forwarded verbatim). */
    public static final String X_IDEMPOTENCY_KEY = "X-Idempotency-Key";

    private GatewayHeaders() { /* constants only */ }
}