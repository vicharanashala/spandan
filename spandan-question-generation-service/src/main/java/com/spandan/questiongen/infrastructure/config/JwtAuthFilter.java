package com.spandan.questiongen.infrastructure.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.util.Base64;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);
    private final SecretKey secretKey;

    public JwtAuthFilter(@Value("${JWT_SECRET:default-secret-that-should-be-overridden-in-prod}") String jwtSecret) {
        byte[] keyBytes = Base64.getDecoder().decode(
            Base64.getEncoder().encodeToString(jwtSecret.getBytes())
        );
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(header.substring(7))
                    .getPayload();

                String userId = claims.getSubject();
                String role = claims.get("role", String.class);

                if (userId != null && "TEACHER".equals(role)) {
                    var auth = new UsernamePasswordAuthenticationToken(
                        userId, null, List.of(new SimpleGrantedAuthority("ROLE_TEACHER"))
                    );
                    SecurityContextHolder.getContext().setAuthentication(auth);
                } else if (userId != null && role != null) {
                    log.warn("Non-TEACHER role attempted to access QGS: userId={}, role={}", userId, role);
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    return;
                }
            } catch (Exception e) {
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }
}
