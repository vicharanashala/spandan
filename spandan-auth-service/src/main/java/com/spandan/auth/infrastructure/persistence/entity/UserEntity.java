package com.spandan.auth.infrastructure.persistence.entity;

import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.enums.AccountStatus;
import com.spandan.auth.domain.enums.Role;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    private UUID id;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 60)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_status", nullable = false, length = 20)
    private AccountStatus accountStatus;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UserEntity() {}

    public UserEntity(UUID id, String fullName, String email, String passwordHash,
                      Role role, AccountStatus accountStatus, int failedLoginAttempts,
                      Instant lastLoginAt, Instant createdAt, Instant updatedAt) {
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

    public static UserEntity fromDomain(User user) {
        return new UserEntity(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getRole(),
                user.getAccountStatus(),
                user.getFailedLoginAttempts(),
                user.getLastLoginAt(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }

    public User toDomain() {
        return new User(
                id, fullName, email, passwordHash, role,
                accountStatus, failedLoginAttempts, lastLoginAt,
                createdAt, updatedAt
        );
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
