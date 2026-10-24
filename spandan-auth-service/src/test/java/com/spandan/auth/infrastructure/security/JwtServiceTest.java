package com.spandan.auth.infrastructure.security;

import com.spandan.auth.application.service.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;
    private final String secret = Base64.getEncoder().encodeToString(
            "my-secret-key-that-is-at-least-256-bits-long-for-hs256".getBytes()
    );

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(secret, 900_000, 604_800_000);
    }

    @Test
    void generateAndValidateToken() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId, "test@test.com", "TEACHER");

        Claims claims = jwtService.validateToken(token);

        assertEquals(userId.toString(), claims.getSubject());
        assertEquals("TEACHER", claims.get("role"));
        assertEquals("test@test.com", claims.get("email"));
        assertEquals("spandan-auth-service", claims.getIssuer());
        assertNotNull(claims.getId());
        assertNotNull(claims.getIssuedAt());
        assertNotNull(claims.getExpiration());
    }

    @Test
    void rejectTamperedToken() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId, "test@test.com", "STUDENT");
        String tampered = token + "tampered";

        assertThrows(JwtException.class, () -> jwtService.validateToken(tampered));
    }

    @Test
    void rejectExpiredToken() {
        JwtService expired = new JwtService(secret, -1_000, 604_800_000);
        UUID userId = UUID.randomUUID();
        String token = expired.generateAccessToken(userId, "test@test.com", "STUDENT");

        assertThrows(JwtException.class, () -> expired.validateToken(token));
    }

    @Test
    void rejectWrongSignature() {
        String otherSecret = Base64.getEncoder().encodeToString(
                "different-secret-key-that-is-also-long-enough-for-testing".getBytes()
        );
        JwtService otherService = new JwtService(otherSecret, 900_000, 604_800_000);

        UUID userId = UUID.randomUUID();
        String token = otherService.generateAccessToken(userId, "test@test.com", "TEACHER");

        assertThrows(JwtException.class, () -> jwtService.validateToken(token));
    }

    @Test
    void tokenContainsUniqueJti() {
        UUID userId = UUID.randomUUID();
        String token1 = jwtService.generateAccessToken(userId, "a@test.com", "TEACHER");
        String token2 = jwtService.generateAccessToken(userId, "a@test.com", "TEACHER");

        Claims claims1 = jwtService.validateToken(token1);
        Claims claims2 = jwtService.validateToken(token2);

        assertNotEquals(claims1.getId(), claims2.getId());
    }

    @Test
    void generateTokenWithAdminRole() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId, "admin@test.com", "ADMIN");

        Claims claims = jwtService.validateToken(token);
        assertEquals("ADMIN", claims.get("role"));
        assertEquals(userId.toString(), claims.getSubject());
    }

    @Test
    void ttlInSeconds() {
        assertEquals(900, jwtService.getAccessTokenTtlSeconds());
    }
}
