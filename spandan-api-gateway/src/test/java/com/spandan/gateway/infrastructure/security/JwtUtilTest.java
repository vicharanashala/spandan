package com.spandan.gateway.infrastructure.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link JwtUtil}. Verifies that the gateway:
 * <ul>
 *   <li>Accepts tokens signed with the configured HMAC secret.</li>
 *   <li>Rejects tokens with an unrecognized role claim — including the legacy SUPERADMIN.</li>
 *   <li>Rejects tokens with a missing role claim.</li>
 *   <li>Rejects expired tokens.</li>
 *   <li>Rejects tokens signed with the wrong key.</li>
 * </ul>
 */
class JwtUtilTest {

    /** Test secret: 32 bytes encoded as base64. */
    private static final String BASE64_SECRET =
            "ZGV2LW9ubHktc2VjcmV0LXdoaWNoLW11c3QtYmUtcmVwbGFjZWQtaW4tcHJvZHVjdGlvbi0tCg==";
    private static SecretKey signingKey;

    @BeforeAll
    static void setupKey() {
        byte[] keyBytes = Decoders.BASE64.decode(BASE64_SECRET);
        signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    private String mint(String role, long ttlMillis) {
        Date now = new Date();
        return Jwts.builder()
                .subject("user-123")
                .claim("role", role)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttlMillis))
                .signWith(signingKey)
                .compact();
    }

    private String mintWithOtherKey(String role) {
        SecretKey other = Keys.hmacShaKeyFor("another-secret-which-is-at-least-32-bytes-long!!".getBytes());
        Date now = new Date();
        return Jwts.builder()
                .subject("user-123")
                .claim("role", role)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 60_000))
                .signWith(other)
                .compact();
    }

    @Test
    void parsesValidAdminToken() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        var claims = util.parse(mint("ADMIN", 60_000));
        assertTrue(claims.isPresent());
        assertEquals("user-123", util.userId(claims.get()));
        assertEquals(Role.ADMIN, util.role(claims.get()));
    }

    @Test
    void parsesValidTeacherAndStudentTokens() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        assertEquals(Role.TEACHER, util.role(util.parse(mint("TEACHER", 60_000)).orElseThrow()));
        assertEquals(Role.STUDENT, util.role(util.parse(mint("STUDENT", 60_000)).orElseThrow()));
    }

    @Test
    void rejectsUnknownRole() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        var claims = util.parse(mint("SUPERADMIN", 60_000));
        assertTrue(claims.isPresent());
        assertNull(util.role(claims.get()), "Unknown role strings must NOT be coerced");
    }

    @Test
    void rejectsMissingRole() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        Date now = new Date();
        String token = Jwts.builder()
                .subject("user-123")
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 60_000))
                .signWith(signingKey)
                .compact();
        var claims = util.parse(token);
        assertTrue(claims.isPresent());
        assertNull(util.role(claims.get()));
    }

    @Test
    void rejectsExpiredToken() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        var claims = util.parse(mint("ADMIN", -1_000));
        assertFalse(claims.isPresent());
    }

    @Test
    void rejectsTokenSignedWithDifferentKey() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        var claims = util.parse(mintWithOtherKey("ADMIN"));
        assertFalse(claims.isPresent());
    }

    @Test
    void rejectsNullOrBlankToken() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        assertFalse(util.parse(null).isPresent());
        assertFalse(util.parse("").isPresent());
        assertFalse(util.parse("   ").isPresent());
        assertFalse(util.parse("not.a.jwt").isPresent());
    }

    @Test
    void rejectsTokenWithoutSubject() {
        JwtUtil util = new JwtUtil(BASE64_SECRET);
        Date now = new Date();
        String token = Jwts.builder()
                .claim("role", "ADMIN")
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 60_000))
                .signWith(signingKey)
                .compact();
        var claims = util.parse(token);
        assertTrue(claims.isPresent());
        assertNull(util.userId(claims.get()));
    }
}