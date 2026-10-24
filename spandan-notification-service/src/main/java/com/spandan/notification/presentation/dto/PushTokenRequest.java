package com.spandan.notification.presentation.dto;

import com.spandan.notification.domain.enums.Platform;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record PushTokenRequest(
        @NotBlank String deviceId,
        @NotNull Platform platform,
        @NotBlank String pushToken) {}
