package com.spandan.review.domain.exception;

public class ReviewException extends RuntimeException {
    private final int statusCode;

    public ReviewException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static ReviewException notFound(String msg) { return new ReviewException(msg, 404); }
    public static ReviewException forbidden(String msg) { return new ReviewException(msg, 403); }
    public static ReviewException conflict(String msg) { return new ReviewException(msg, 409); }
    public static ReviewException badRequest(String msg) { return new ReviewException(msg, 400); }
    public static ReviewException gone(String msg) { return new ReviewException(msg, 410); }
}
