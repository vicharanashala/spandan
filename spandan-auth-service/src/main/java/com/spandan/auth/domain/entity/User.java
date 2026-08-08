package com.spandan.auth.domain.entity;

import com.spandan.auth.domain.enums.AccountStatus;
import com.spandan.auth.domain.enums.Role;

import java.time.Instant;
import java.util.UUID;

public class User {

    private final UUID id;
    private String fullName;
    private String email;
    private String passwordHash;
    private Role role;
    private AccountStatus accountStatus;
    private int failedLoginAttempts;
    private Instant lastLoginAt;
    private final Instant createdAt;
    private Instant updatedAt;

    private static final int MAX_FAILED_ATTEMPTS = 5;

    public User(UUID id, String fullName, String email, String passwordHash, Role role,
                AccountStatus accountStatus, int failedLoginAttempts, Instant lastLoginAt,
                Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.accountStatus = accountStatus;
        this.failedLoginAttempts = failedLoginAttempts;
        this.lastLoginAt = lastLoginAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static User create(String fullName, String email, String passwordHash, Role role) {
        Instant now = Instant.now();
        return new User(
                UUID.randomUUID(),
                fullName,
                email,
                passwordHash,
                role,
                AccountStatus.ACTIVE,
                0,
                null,
                now,
                now
        );
    }

    public void validateCanLogin() {
        if (accountStatus == AccountStatus.LOCKED) {
            throw new IllegalStateException("Account is locked due to too many failed attempts");
        }
        if (accountStatus == AccountStatus.DISABLED) {
            throw new IllegalStateException("Account is disabled");
        }
    }

    public void recordFailedLogin() {
        this.failedLoginAttempts++;
        if (this.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
            this.accountStatus = AccountStatus.LOCKED;
        }
        this.updatedAt = Instant.now();
    }

    public void recordSuccessfulLogin() {
        this.failedLoginAttempts = 0;
        this.lastLoginAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public AccountStatus getAccountStatus() { return accountStatus; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public Instant getLastLoginAt() { return lastLoginAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
