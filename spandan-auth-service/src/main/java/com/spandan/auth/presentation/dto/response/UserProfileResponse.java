package com.spandan.auth.presentation.dto.response;

import java.time.Instant;
import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String fullName,
        String email,
        String role,
        Instant lastLoginAt
) {}
