package com.spandan.response.domain.exception;

public class ResponseServiceException extends RuntimeException {
    private final int statusCode;

    public ResponseServiceException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static ResponseServiceException notFound(String message) {
        return new ResponseServiceException(message, 404);
    }

    public static ResponseServiceException badRequest(String message) {
        return new ResponseServiceException(message, 400);
    }

    public static ResponseServiceException conflict(String message) {
        return new ResponseServiceException(message, 409);
    }
}
