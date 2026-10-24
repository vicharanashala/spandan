package com.spandan.gateway.domain.exception;

public class GatewayException extends RuntimeException {
    private final int statusCode;

    public GatewayException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static GatewayException unauthorized(String message) {
        return new GatewayException(message, 401);
    }

    public static GatewayException badRequest(String message) {
        return new GatewayException(message, 400);
    }

    public static GatewayException serviceUnavailable(String message) {
        return new GatewayException(message, 503);
    }
}
