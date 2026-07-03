package com.spandan.auth.infrastructure.kafka;

import java.time.Instant;
import java.util.UUID;

public record AuthEvent(
        String eventType,
        UUID userId,
        String role,
        Instant timestamp
) {}
