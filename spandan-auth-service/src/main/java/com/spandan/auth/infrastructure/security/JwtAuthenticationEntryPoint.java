package com.spandan.auth.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        response.setContentType("application/json");
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.getWriter().write(
                "{\"timestamp\":\"" + java.time.Instant.now() + "\"," +
                "\"status\":401," +
                "\"error\":\"Unauthorized\"," +
                "\"message\":\"" + authException.getMessage() + "\"," +
                "\"path\":\"" + request.getRequestURI() + "\"}"
        );
    }
}
