package com.spandan.gateway.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Base64;

@Component
public class JwtUtil {

    private final SecretKey signingKey;

    public JwtUtil(@Value("${jwt.secret}") String base64Secret) {
        byte[] keyBytes = Base64.getDecoder().decode(base64Secret);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public Claims validateAndParse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            validateAndParse(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

}
