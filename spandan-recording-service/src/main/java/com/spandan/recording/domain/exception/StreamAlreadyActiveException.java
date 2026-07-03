package com.spandan.recording.domain.exception;

public class StreamAlreadyActiveException extends RuntimeException {
    public StreamAlreadyActiveException(String message) { super(message); }
}
