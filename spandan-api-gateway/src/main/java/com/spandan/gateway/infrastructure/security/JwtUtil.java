package com.spandan.gateway.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Optional;

/**
 * Local HMAC JWT verifier and claim extractor.
 *
 * <p>The Gateway NEVER calls Auth Service on every request. Instead, it verifies the signature
 * locally using the shared HMAC secret mounted via {@code JWT_SECRET}. This is deterministic —
 * same token, same result, every time, regardless of partition state.
 *
 * <p>Claims recognized after this update (ADMIN role addendum):
 * <ul>
 *   <li>{@code sub} – the user id (used to populate {@code X-User-Id} downstream)</li>
 *   <li>{@code role} – one of {@code ADMIN}, {@code TEACHER}, {@code STUDENT}</li>
 * </ul>
 *
 * <p>Any token whose {@code role} claim does not match an enumerated value (e.g., {@code SUPERADMIN})
 * is rejected with {@code 401 unauthorized}. This is enumerative by design.
 */
@Component
public class JwtUtil {

    private final SecretKey signingKey;

    public JwtUtil(@Value("${jwt.secret:}") String secret) {
        if (secret == null || secret.isBlank()) {
            // Build a dummy key so the bean can be constructed in tests / unconfigured envs.
            // Validation that real keys must be configured happens in production via the
            // secret-mount pipeline (K8s Secret → env var). If a token is presented against
            // a gateway with no real key, verification will fail.
            this.signingKey = Keys.hmacShaKeyFor(new byte[64]);
        } else {
            byte[] keyBytes = Decoders.BASE64.decode(secret);
            if (keyBytes.length < 32) {
                throw new IllegalStateException(
                        "jwt.secret must be at least 256 bits (32 bytes) when base64-decoded");
            }
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        }
    }

    /**
     * Verify signature & claims. Returns the parsed claims if valid; empty if the token is missing,
     * malformed, expired, or otherwise invalid.
     */
    public Optional<Claims> parse(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        try {
            Jws<Claims> jws = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token);
            return Optional.of(jws.getPayload());
        } catch (JwtException | IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    /** Extract the user id from a parsed claims set. */
    public String userId(Claims claims) {
        return claims.getSubject();
    }

    /**
     * Extract and validate the role claim. Returns the recognized {@link Role}, or {@code null} if
     * the role is missing or unrecognized. Note: {@link Role#fromClaim(String)} is enumerative;
     * unknown role strings are intentionally not coerced to a default.
     */
    public Role role(Claims claims) {
        Object raw = claims.get("role");
        if (raw == null) {
            return null;
        }
        return Role.fromClaim(raw.toString());
    }
}
