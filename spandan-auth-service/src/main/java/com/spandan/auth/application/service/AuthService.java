package com.spandan.auth.application.service;

import com.spandan.auth.application.mapper.UserMapper;
import com.spandan.auth.application.port.RefreshTokenRepository;
import com.spandan.auth.application.port.TokenBlacklistPort;
import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.RefreshToken;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.exception.AccountDisabledException;
import com.spandan.auth.domain.exception.AccountLockedException;
import com.spandan.auth.domain.exception.InvalidCredentialsException;
import com.spandan.auth.domain.exception.TokenRevokedException;
import com.spandan.auth.infrastructure.kafka.AuthEvent;
import com.spandan.auth.infrastructure.kafka.AuthEventPublisher;
import com.spandan.auth.presentation.dto.request.LoginRequest;
import com.spandan.auth.presentation.dto.request.LogoutRequest;
import com.spandan.auth.presentation.dto.response.AuthResponse;
import com.spandan.auth.presentation.dto.response.TokenValidationResponse;
import com.spandan.auth.presentation.dto.response.UserProfileResponse;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final TokenBlacklistPort tokenBlacklistPort;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthEventPublisher eventPublisher;

    public AuthService(UserRepository userRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       TokenBlacklistPort tokenBlacklistPort,
                       JwtService jwtService,
                       PasswordEncoder passwordEncoder,
                       AuthEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.tokenBlacklistPort = tokenBlacklistPort;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailWithLock(request.email())
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));

        try {
            user.validateCanLogin();
        } catch (IllegalStateException e) {
            if (user.getAccountStatus().name().equals("LOCKED")) {
                throw new AccountLockedException("Account is locked due to too many failed attempts");
            }
            throw new AccountDisabledException("Account is disabled");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            user.recordFailedLogin();
            userRepository.save(user);
            throw new InvalidCredentialsException("Invalid email or password");
        }

        user.recordSuccessfulLogin();
        userRepository.save(user);

        String accessToken = jwtService.generateAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String refreshToken = generateAndStoreRefreshToken(user.getId());

        eventPublisher.publish(new AuthEvent("user.login.success", user.getId(), user.getRole().name(), Instant.now()));

        return new AuthResponse(
                accessToken,
                refreshToken,
                "Bearer",
                jwtService.getAccessTokenTtlSeconds(),
                UserMapper.toProfileResponse(user)
        );
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public void logout(LogoutRequest request, String accessTokenJti, long accessTokenTtlSeconds) {
        tokenBlacklistPort.blacklist(accessTokenJti, accessTokenTtlSeconds);

        String refreshTokenHash = hashToken(request.refreshToken());
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(refreshTokenHash)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid refresh token"));

        storedToken.revoke();
        refreshTokenRepository.save(storedToken);

        eventPublisher.publish(new AuthEvent("user.logout", storedToken.getUserId(), null, Instant.now()));
    }

    public TokenValidationResponse validateToken(String token) {
        try {
            Claims claims = jwtService.validateToken(token);
            String jti = claims.getId();

            if (tokenBlacklistPort.isBlacklisted(jti)) {
                return TokenValidationResponse.invalid("Token has been revoked");
            }

            return TokenValidationResponse.valid(
                    UUID.fromString(claims.getSubject()),
                    claims.get("role", String.class),
                    claims.getExpiration().toInstant()
            );
        } catch (JwtException e) {
            return TokenValidationResponse.invalid(e.getMessage());
        }
    }

    @Transactional(isolation = Isolation.SERIALIZABLE)
    public AuthResponse refresh(String rawRefreshToken) {
        String tokenHash = hashToken(rawRefreshToken);
        RefreshToken storedToken = refreshTokenRepository.findByTokenHashWithLock(tokenHash)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid refresh token"));

        if (!storedToken.isValid()) {
            if (storedToken.isRevoked()) {
                handleTokenReuse(storedToken);
            }
            throw new TokenRevokedException("Refresh token is invalid or expired");
        }

        User user = userRepository.findById(storedToken.getUserId())
                .orElseThrow(() -> new InvalidCredentialsException("User not found"));

        storedToken.revokeChain(storedToken.getId());
        refreshTokenRepository.save(storedToken);

        String newAccessToken = jwtService.generateAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String newRefreshToken = generateAndStoreRefreshToken(user.getId());

        return new AuthResponse(
                newAccessToken,
                newRefreshToken,
                "Bearer",
                jwtService.getAccessTokenTtlSeconds(),
                UserMapper.toProfileResponse(user)
        );
    }

    @Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED)
    public UserProfileResponse getCurrentUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new InvalidCredentialsException("User not found"));
        return UserMapper.toProfileResponse(user);
    }

    private String generateAndStoreRefreshToken(UUID userId) {
        byte[] randomBytes = new byte[64];
        new SecureRandom().nextBytes(randomBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        String tokenHash = hashToken(rawToken);

        RefreshToken refreshToken = RefreshToken.create(
                userId,
                tokenHash,
                Instant.now().plusMillis(jwtService.getRefreshTokenExpirationMs())
        );
        refreshTokenRepository.save(refreshToken);

        return rawToken;
    }

    public long getAccessTokenTtlSeconds() {
        return jwtService.getAccessTokenTtlSeconds();
    }

    private String hashToken(String token) {
        return new String(
                org.springframework.security.crypto.codec.Hex.encode(
                        sha256(token.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                )
        );
    }

    private byte[] sha256(byte[] input) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            return md.digest(input);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private void handleTokenReuse(RefreshToken revokedToken) {
        refreshTokenRepository.deleteByUserId(revokedToken.getUserId());
    }
}
