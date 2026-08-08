package com.spandan.gateway.infrastructure.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * Standard JSON error envelope returned by the gateway for every error response.
 *
 * <p>Schema (post-update):
 * <pre>{@code
 * {
 *   "error": "error_code",
 *   "message": "Human-readable description",
 *   "status": 401,
 *   "timestamp": "2026-07-03T11:00:00Z",
 *   "path": "/api/v1/polls/...",
 *   "correlation_id": "req-a1b2c3d4",
 *   "retry_after_seconds": 30        // present on 429 only
 * }
 * }</pre>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorEnvelope(
        String error,
        String message,
        int status,
        Instant timestamp,
        String path,
        String correlation_id,
        Integer retry_after_seconds
) {
    public static ErrorEnvelope of(String code, String message, int status,
                                   String path, String correlationId) {
        return new ErrorEnvelope(code, message, status, Instant.now(), path, correlationId, null);
    }

    public ErrorEnvelope withRetryAfter(int retryAfterSeconds) {
        return new ErrorEnvelope(error, message, status, timestamp, path, correlation_id, retryAfterSeconds);
    }
}