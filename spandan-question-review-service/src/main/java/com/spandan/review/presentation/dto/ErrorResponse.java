package com.spandan.review.presentation.dto;

import java.time.Instant;

public record ErrorResponse(int status, String error, String message, Instant timestamp) {
    public ErrorResponse(int status, String error, String message) {
        this(status, error, message, Instant.now());
    }
}
