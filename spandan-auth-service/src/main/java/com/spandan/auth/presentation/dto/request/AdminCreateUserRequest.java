package com.spandan.auth.presentation.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AdminCreateUserRequest(
        @NotBlank String fullName,
        @NotBlank @Email String email,
        @NotBlank String password,
        @NotBlank @Pattern(regexp = "ADMIN|TEACHER|STUDENT") String role
) {}
