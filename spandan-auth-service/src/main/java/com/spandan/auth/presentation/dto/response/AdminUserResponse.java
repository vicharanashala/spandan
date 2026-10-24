package com.spandan.auth.presentation.dto.response;

import java.time.Instant;
import java.util.UUID;

public record AdminUserResponse(
        UUID id,
        String fullName,
        String email,
        String role,
        String accountStatus,
        int failedLoginAttempts,
        Instant lastLoginAt,
        Instant createdAt
) {}
