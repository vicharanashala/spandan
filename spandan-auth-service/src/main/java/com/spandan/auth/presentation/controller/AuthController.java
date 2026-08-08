package com.spandan.auth.presentation.controller;

import com.spandan.auth.application.service.AdminService;
import com.spandan.auth.application.service.AuthService;
import com.spandan.auth.presentation.dto.request.AdminCreateUserRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateRoleRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateStatusRequest;
import com.spandan.auth.presentation.dto.request.LoginRequest;
import com.spandan.auth.presentation.dto.request.LogoutRequest;
import com.spandan.auth.presentation.dto.request.RefreshTokenRequest;
import com.spandan.auth.presentation.dto.response.AdminUserResponse;
import com.spandan.auth.presentation.dto.response.AuthResponse;
import com.spandan.auth.presentation.dto.response.TokenValidationResponse;
import com.spandan.auth.presentation.dto.response.UserProfileResponse;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final AdminService adminService;

    public AuthController(AuthService authService, AdminService adminService) {
        this.authService = authService;
        this.adminService = adminService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody LogoutRequest request,
                                       Authentication authentication) {
        Claims claims = (Claims) authentication.getDetails();
        String jti = claims.getId();
        long remainingTtl = (claims.getExpiration().getTime() - System.currentTimeMillis()) / 1000;
        authService.logout(request, jti, Math.max(remainingTtl, 1));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/validate")
    public ResponseEntity<TokenValidationResponse> validateToken(@RequestParam String token) {
        TokenValidationResponse response = authService.validateToken(token);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        AuthResponse response = authService.refresh(request.refreshToken());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser(Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getPrincipal().toString());
        UserProfileResponse response = authService.getCurrentUser(userId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/admin/users")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AdminUserResponse> createUser(@Valid @RequestBody AdminCreateUserRequest request,
                                                         Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getPrincipal().toString());
        AdminUserResponse response = adminService.createUser(request, adminId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/admin/users")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<AdminUserResponse>> listUsers() {
        return ResponseEntity.ok(adminService.listUsers());
    }

    @PatchMapping("/admin/users/{id}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AdminUserResponse> updateUserRole(@PathVariable UUID id,
                                                             @Valid @RequestBody AdminUpdateRoleRequest request,
                                                             Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getPrincipal().toString());
        AdminUserResponse response = adminService.updateUserRole(id, request, adminId);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/admin/users/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AdminUserResponse> updateUserStatus(@PathVariable UUID id,
                                                               @Valid @RequestBody AdminUpdateStatusRequest request,
                                                               Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getPrincipal().toString());
        AdminUserResponse response = adminService.updateUserStatus(id, request, adminId);
        return ResponseEntity.ok(response);
    }

}
