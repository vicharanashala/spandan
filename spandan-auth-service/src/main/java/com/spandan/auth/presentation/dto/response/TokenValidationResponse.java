package com.spandan.auth.presentation.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TokenValidationResponse(
        boolean valid,
        UUID userId,
        String role,
        Instant expiresAt,
        String error
) {
    public static TokenValidationResponse valid(UUID userId, String role, Instant expiresAt) {
        return new TokenValidationResponse(true, userId, role, expiresAt, null);
    }

    public static TokenValidationResponse invalid(String error) {
        return new TokenValidationResponse(false, null, null, null, error);
    }
}
