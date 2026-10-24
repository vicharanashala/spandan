package com.spandan.questiongen.domain.exception;

public class GenerationException extends RuntimeException {
    private final int statusCode;

    public GenerationException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static GenerationException notFound(String msg) { return new GenerationException(msg, 404); }
    public static GenerationException forbidden(String msg) { return new GenerationException(msg, 403); }
    public static GenerationException conflict(String msg) { return new GenerationException(msg, 409); }
    public static GenerationException badRequest(String msg) { return new GenerationException(msg, 400); }
    public static GenerationException serviceUnavailable(String msg) { return new GenerationException(msg, 503); }
    public static GenerationException gone(String msg) { return new GenerationException(msg, 410); }
}
