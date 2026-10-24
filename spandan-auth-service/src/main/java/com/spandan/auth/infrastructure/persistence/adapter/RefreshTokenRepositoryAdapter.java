package com.spandan.auth.infrastructure.persistence.adapter;

import com.spandan.auth.application.port.RefreshTokenRepository;
import com.spandan.auth.domain.entity.RefreshToken;
import com.spandan.auth.infrastructure.persistence.entity.RefreshTokenEntity;
import com.spandan.auth.infrastructure.persistence.jpa.JpaRefreshTokenRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public class RefreshTokenRepositoryAdapter implements RefreshTokenRepository {

    private final JpaRefreshTokenRepository jpaRepository;

    public RefreshTokenRepositoryAdapter(JpaRefreshTokenRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    public Optional<RefreshToken> findByTokenHash(String tokenHash) {
        return jpaRepository.findByTokenHash(tokenHash).map(RefreshTokenEntity::toDomain);
    }

    @Override
    public Optional<RefreshToken> findByTokenHashWithLock(String tokenHash) {
        return jpaRepository.findByTokenHashWithLock(tokenHash).map(RefreshTokenEntity::toDomain);
    }

    @Override
    public RefreshToken save(RefreshToken refreshToken) {
        RefreshTokenEntity entity = RefreshTokenEntity.fromDomain(refreshToken);
        return jpaRepository.save(entity).toDomain();
    }

    @Override
    public void deleteByUserId(UUID userId) {
        jpaRepository.deleteByUserId(userId);
    }

    @Override
    public void deleteExpired() {
        jpaRepository.deleteAllByExpiresAtBefore(Instant.now());
    }
}
