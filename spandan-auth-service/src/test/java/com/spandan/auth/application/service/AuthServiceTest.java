package com.spandan.auth.application.service;

import com.spandan.auth.application.port.RefreshTokenRepository;
import com.spandan.auth.application.port.TokenBlacklistPort;
import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.enums.AccountStatus;
import com.spandan.auth.domain.enums.Role;
import com.spandan.auth.domain.exception.AccountLockedException;
import com.spandan.auth.domain.exception.InvalidCredentialsException;
import com.spandan.auth.infrastructure.kafka.AuthEventPublisher;
import com.spandan.auth.presentation.dto.request.LoginRequest;
import com.spandan.auth.presentation.dto.response.AuthResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private TokenBlacklistPort tokenBlacklistPort;
    @Mock private AuthEventPublisher eventPublisher;
    @Mock private JwtService jwtService;

    private PasswordEncoder passwordEncoder;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder(4);
        authService = new AuthService(userRepository, refreshTokenRepository,
                tokenBlacklistPort, jwtService, passwordEncoder, eventPublisher);
    }

    @Test
    void adminLoginSuccess() {
        String email = "admin@test.com";
        String password = "adminpass";
        String hashed = passwordEncoder.encode(password);
        User user = User.create("Test Admin", email, hashed, Role.ADMIN);

        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(jwtService.generateAccessToken(any(), any(), any())).thenReturn("access-token");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(900L);
        when(jwtService.getRefreshTokenExpirationMs()).thenReturn(604800000L);
        when(userRepository.save(any())).thenReturn(user);

        AuthResponse response = authService.login(new LoginRequest(email, password));

        assertNotNull(response);
        assertEquals("access-token", response.accessToken());
        assertEquals("Test Admin", response.user().fullName());
        assertEquals("ADMIN", response.user().role());

        verify(userRepository).save(any());
        verify(eventPublisher).publish(any());
    }

    @Test
    void loginSuccess() {
        String email = "teacher@test.com";
        String password = "password123";
        String hashed = passwordEncoder.encode(password);
        User user = User.create("Test Teacher", email, hashed, Role.TEACHER);

        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(jwtService.generateAccessToken(any(), any(), any())).thenReturn("access-token");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(900L);
        when(jwtService.getRefreshTokenExpirationMs()).thenReturn(604800000L);
        when(userRepository.save(any())).thenReturn(user);

        AuthResponse response = authService.login(new LoginRequest(email, password));

        assertNotNull(response);
        assertEquals("access-token", response.accessToken());
        assertNotNull(response.refreshToken());
        assertEquals("Bearer", response.tokenType());
        assertEquals(900L, response.expiresIn());
        assertEquals("Test Teacher", response.user().fullName());

        verify(userRepository).save(any());
        verify(eventPublisher).publish(any());
    }

    @Test
    void loginInvalidPassword() {
        String email = "teacher@test.com";
        String password = "password123";
        String hashed = passwordEncoder.encode("different");
        User user = User.create("Test Teacher", email, hashed, Role.TEACHER);

        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenReturn(user);

        assertThrows(InvalidCredentialsException.class,
                () -> authService.login(new LoginRequest(email, password)));

        verify(userRepository).save(any());
    }

    @Test
    void loginAccountLocked() {
        String email = "locked@test.com";
        String hashed = passwordEncoder.encode("password123");
        User user = new User(
                UUID.randomUUID(), "Locked User", email, hashed, Role.STUDENT,
                AccountStatus.LOCKED, 5, null, Instant.now(), Instant.now()
        );

        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));

        assertThrows(AccountLockedException.class,
                () -> authService.login(new LoginRequest(email, "password123")));

        verify(userRepository, never()).save(any());
    }

    @Test
    void loginUserNotFound() {
        when(userRepository.findByEmail("missing@test.com")).thenReturn(Optional.empty());

        assertThrows(InvalidCredentialsException.class,
                () -> authService.login(new LoginRequest("missing@test.com", "password123")));
    }

    @Test
    void loginFailedAttemptsTriggerLock() {
        String email = "nearly@test.com";
        String password = "password123";
        String hashed = passwordEncoder.encode(password);
        User user = new User(
                UUID.randomUUID(), "Nearly Locked", email, hashed, Role.STUDENT,
                AccountStatus.ACTIVE, 4, null, Instant.now(), Instant.now()
        );

        when(userRepository.findByEmail(email)).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThrows(InvalidCredentialsException.class,
                () -> authService.login(new LoginRequest(email, "wrongpass")));

        assertEquals(5, user.getFailedLoginAttempts());
        assertEquals(AccountStatus.LOCKED, user.getAccountStatus());
    }

    @Test
    void validateTokenValid() {
        String token = "valid-token";
        UUID userId = UUID.randomUUID();
        when(jwtService.validateToken(token)).thenReturn(
                io.jsonwebtoken.Jwts.claims()
                        .id(UUID.randomUUID().toString())
                        .subject(userId.toString())
                        .add("role", "TEACHER")
                        .expiration(java.util.Date.from(Instant.now().plusSeconds(900)))
                        .build()
        );

        var response = authService.validateToken(token);

        assertTrue(response.valid());
        assertEquals(userId, response.userId());
        assertEquals("TEACHER", response.role());
    }

    @Test
    void validateTokenBlacklisted() {
        String token = "blacklisted-token";
        UUID userId = UUID.randomUUID();
        var claims = io.jsonwebtoken.Jwts.claims()
                .id("test-jti")
                .subject(userId.toString())
                .add("role", "TEACHER")
                .expiration(java.util.Date.from(Instant.now().plusSeconds(900)))
                .build();

        when(jwtService.validateToken(token)).thenReturn(claims);
        when(tokenBlacklistPort.isBlacklisted("test-jti")).thenReturn(true);

        var response = authService.validateToken(token);

        assertFalse(response.valid());
    }
}
