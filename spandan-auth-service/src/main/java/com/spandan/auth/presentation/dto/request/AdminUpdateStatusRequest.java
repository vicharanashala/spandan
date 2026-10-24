package com.spandan.auth.presentation.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AdminUpdateStatusRequest(
        @NotBlank @Pattern(regexp = "ACTIVE|LOCKED|DISABLED") String status
) {}
