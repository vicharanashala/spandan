package com.spandan.auth.presentation.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AdminUpdateRoleRequest(
        @NotBlank @Pattern(regexp = "ADMIN|TEACHER|STUDENT") String role
) {}
