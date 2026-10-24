package com.spandan.auth.presentation.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn,
        @JsonProperty("user") UserProfileResponse user
) {}
