package com.spandan.notification.infrastructure.config;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

    private final String jwtSecret;
    private final ObjectMapper objectMapper;

    public JwtAuthFilter(@Value("${auth.jwt.secret}") String jwtSecret, ObjectMapper objectMapper) {
        this.jwtSecret = jwtSecret;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");

        if (header == null || !header.startsWith("Bearer ")) {
            response.setStatus(401);
            response.setContentType("application/json");
            objectMapper.writeValue(response.getOutputStream(), Map.of("error", "MISSING_TOKEN", "message", "No JWT token provided"));
            return;
        }

        try {
            String token = header.substring(7);
            Map<String, Object> claims = validateToken(token);

            String userId = (String) claims.get("sub");
            String role = (String) claims.get("role");

            if (userId == null || role == null) {
                throw new RuntimeException("Invalid token claims");
            }

            List<SimpleGrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_" + role));
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(UUID.fromString(userId), null, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (Exception e) {
            log.warn("JWT validation failed: {}", e.getMessage());
            response.setStatus(401);
            response.setContentType("application/json");
            objectMapper.writeValue(response.getOutputStream(), Map.of("error", "INVALID_TOKEN", "message", "Token validation failed"));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Map<String, Object> validateToken(String token) throws Exception {
        String[] parts = token.split("\\.");
        if (parts.length != 3) throw new RuntimeException("Malformed JWT");

        String header = parts[0];
        String payload = parts[1];
        String signature = parts[2];

        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec keySpec = new SecretKeySpec(jwtSecret.getBytes(), "HmacSHA256");
        mac.init(keySpec);
        byte[] expectedSig = mac.doFinal((header + "." + payload).getBytes());
        String expectedSigBase64 = Base64.getUrlEncoder().withoutPadding().encodeToString(expectedSig);

        if (!expectedSigBase64.equals(signature)) {
            throw new RuntimeException("Invalid JWT signature");
        }

        byte[] decodedPayload = Base64.getUrlDecoder().decode(payload);
        return objectMapper.readValue(decodedPayload, Map.class);
    }
}
