package com.spandan.analytics.domain.exception;

public class AnalyticsException extends RuntimeException {
    private final int statusCode;

    public AnalyticsException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static AnalyticsException notFound(String message) {
        return new AnalyticsException(message, 404);
    }

    public static AnalyticsException forbidden(String message) {
        return new AnalyticsException(message, 403);
    }

    public static AnalyticsException badRequest(String message) {
        return new AnalyticsException(message, 400);
    }

    public static AnalyticsException serviceUnavailable(String message) {
        return new AnalyticsException(message, 503);
    }
}
