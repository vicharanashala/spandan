package com.spandan.auth.infrastructure.persistence.entity;

import com.spandan.auth.domain.entity.RefreshToken;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshTokenEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean revoked;

    @Column(name = "replaced_by_token_id")
    private UUID replacedByTokenId;

    public RefreshTokenEntity() {}

    public RefreshTokenEntity(UUID id, UUID userId, String tokenHash, Instant issuedAt,
                              Instant expiresAt, boolean revoked, UUID replacedByTokenId) {
        this.id = id;
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.revoked = revoked;
        this.replacedByTokenId = replacedByTokenId;
    }

    public static RefreshTokenEntity fromDomain(RefreshToken token) {
        return new RefreshTokenEntity(
                token.getId(),
                token.getUserId(),
                token.getTokenHash(),
                token.getIssuedAt(),
                token.getExpiresAt(),
                token.isRevoked(),
                token.getReplacedByTokenId()
        );
    }

    public RefreshToken toDomain() {
        return new RefreshToken(id, userId, tokenHash, issuedAt, expiresAt, revoked, replacedByTokenId);
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getTokenHash() { return tokenHash; }
    public Instant getIssuedAt() { return issuedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean isRevoked() { return revoked; }
    public UUID getReplacedByTokenId() { return replacedByTokenId; }
}
