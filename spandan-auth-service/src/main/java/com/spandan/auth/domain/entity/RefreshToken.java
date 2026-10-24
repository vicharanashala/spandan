package com.spandan.auth.domain.entity;

import java.time.Instant;
import java.util.UUID;

public class RefreshToken {

    private final UUID id;
    private final UUID userId;
    private final String tokenHash;
    private final Instant issuedAt;
    private Instant expiresAt;
    private boolean revoked;
    private UUID replacedByTokenId;

    public RefreshToken(UUID id, UUID userId, String tokenHash, Instant issuedAt,
                        Instant expiresAt, boolean revoked, UUID replacedByTokenId) {
        this.id = id;
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.revoked = revoked;
        this.replacedByTokenId = replacedByTokenId;
    }

    public static RefreshToken create(UUID userId, String tokenHash, Instant expiresAt) {
        return new RefreshToken(
                UUID.randomUUID(),
                userId,
                tokenHash,
                Instant.now(),
                expiresAt,
                false,
                null
        );
    }

    public void revoke() {
        this.revoked = true;
    }

    public void revokeChain(UUID replacedByTokenId) {
        this.revoked = true;
        this.replacedByTokenId = replacedByTokenId;
    }

    public boolean isValid() {
        return !revoked && Instant.now().isBefore(expiresAt);
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getTokenHash() { return tokenHash; }
    public Instant getIssuedAt() { return issuedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean isRevoked() { return revoked; }
    public UUID getReplacedByTokenId() { return replacedByTokenId; }
}
