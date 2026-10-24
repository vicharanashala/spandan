package com.spandan.transcription.domain.exception;

public class TranscriptionException extends RuntimeException {
    private final int statusCode;

    public TranscriptionException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() { return statusCode; }

    public static TranscriptionException notFound(String msg) { return new TranscriptionException(msg, 404); }
    public static TranscriptionException forbidden(String msg) { return new TranscriptionException(msg, 403); }
    public static TranscriptionException conflict(String msg) { return new TranscriptionException(msg, 409); }
    public static TranscriptionException badRequest(String msg) { return new TranscriptionException(msg, 400); }
    public static TranscriptionException serviceUnavailable(String msg) { return new TranscriptionException(msg, 503); }
}
