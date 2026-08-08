package com.spandan.auth.integration;

import com.spandan.auth.SpandanAuthApplication;
import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.enums.Role;
import com.spandan.auth.presentation.dto.request.LoginRequest;
import com.spandan.auth.presentation.dto.request.LogoutRequest;
import com.spandan.auth.presentation.dto.response.AuthResponse;
import com.spandan.auth.presentation.dto.response.TokenValidationResponse;
import com.spandan.auth.presentation.dto.response.UserProfileResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, classes = SpandanAuthApplication.class)
@ActiveProfiles("test")
@Testcontainers
class AuthFlowIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("auth_db")
            .withUsername("test")
            .withPassword("test");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379);

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID teacherId;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        registry.add("auth.jwt.secret", () -> "dGVzdC1zZWNyZXQta2V5LWZvci1pbnRlZ3JhdGlvbi10ZXN0cy1oczI1Ng==");
    }

    @BeforeEach
    void setUp() {
        User teacher = User.create(
                "Test Teacher",
                "teacher@test.com",
                passwordEncoder.encode("password123"),
                Role.TEACHER
        );
        teacherId = userRepository.save(teacher).getId();

        User admin = User.create(
                "Test Admin",
                "admin@test.com",
                passwordEncoder.encode("adminpass"),
                Role.ADMIN
        );
        userRepository.save(admin);
    }

    @Test
    void fullAuthLifecycle() {
        AuthResponse loginResponse = login();
        assertNotNull(loginResponse.accessToken());
        assertNotNull(loginResponse.refreshToken());

        UserProfileResponse me = getMe(loginResponse.accessToken());
        assertEquals("Test Teacher", me.fullName());
        assertEquals("TEACHER", me.role());

        TokenValidationResponse validation = validateToken(loginResponse.accessToken());
        assertTrue(validation.valid());
        assertEquals(teacherId, validation.userId());

        AuthResponse refreshResponse = refresh(loginResponse.refreshToken());
        assertNotNull(refreshResponse.accessToken());
        assertNotNull(refreshResponse.refreshToken());

        TokenValidationResponse oldTokenValidation = validateToken(loginResponse.accessToken());
        assertTrue(oldTokenValidation.valid());

        logout(loginResponse.accessToken(), loginResponse.refreshToken());

        TokenValidationResponse postLogoutValidation = validateToken(loginResponse.accessToken());
        assertFalse(postLogoutValidation.valid());
    }

    private AuthResponse login() {
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/login",
                new LoginRequest("teacher@test.com", "password123"),
                AuthResponse.class
        );
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    private UserProfileResponse getMe(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        ResponseEntity<UserProfileResponse> response = restTemplate.exchange(
                "/api/v1/auth/me",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                UserProfileResponse.class
        );
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    private TokenValidationResponse validateToken(String token) {
        ResponseEntity<TokenValidationResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/validate?token=" + token,
                null,
                TokenValidationResponse.class
        );
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    private AuthResponse refresh(String refreshToken) {
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/refresh",
                new com.spandan.auth.presentation.dto.request.RefreshTokenRequest(refreshToken),
                AuthResponse.class
        );
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    private void logout(String accessToken, String refreshToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        ResponseEntity<Void> response = restTemplate.exchange(
                "/api/v1/auth/logout",
                HttpMethod.POST,
                new HttpEntity<>(new LogoutRequest(refreshToken), headers),
                Void.class
        );
        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
    }

    @Test
    void adminLoginIssuesAdminJwt() {
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/v1/auth/login",
                new LoginRequest("admin@test.com", "adminpass"),
                AuthResponse.class
        );
        assertEquals(HttpStatus.OK, response.getStatusCode());
        AuthResponse body = response.getBody();
        assertNotNull(body);
        assertEquals("ADMIN", body.user().role());
    }

    @Test
    void adminCanCallAdminEndpoint() {
        ResponseEntity<AuthResponse> loginResponse = restTemplate.postForEntity(
                "/api/v1/auth/login",
                new LoginRequest("admin@test.com", "adminpass"),
                AuthResponse.class
        );
        String adminToken = loginResponse.getBody().accessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        ResponseEntity<String> adminResponse = restTemplate.exchange(
                "/api/v1/auth/admin/users",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class
        );
        assertEquals(HttpStatus.OK, adminResponse.getStatusCode());
    }

    @Test
    void nonAdminCannotCallAdminEndpoint() {
        ResponseEntity<AuthResponse> loginResponse = restTemplate.postForEntity(
                "/api/v1/auth/login",
                new LoginRequest("teacher@test.com", "password123"),
                AuthResponse.class
        );
        String teacherToken = loginResponse.getBody().accessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(teacherToken);
        ResponseEntity<String> adminResponse = restTemplate.exchange(
                "/api/v1/auth/admin/users",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class
        );
        assertEquals(HttpStatus.FORBIDDEN, adminResponse.getStatusCode());
    }
}
