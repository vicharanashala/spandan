package com.spandan.auth.application.port;

import com.spandan.auth.domain.entity.RefreshToken;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
    Optional<RefreshToken> findByTokenHashWithLock(String tokenHash);
    RefreshToken save(RefreshToken refreshToken);
    void deleteByUserId(UUID userId);
    void deleteExpired();
}
