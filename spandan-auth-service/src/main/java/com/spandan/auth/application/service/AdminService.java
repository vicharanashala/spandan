package com.spandan.auth.application.service;

import com.spandan.auth.application.mapper.UserMapper;
import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.enums.AccountStatus;
import com.spandan.auth.domain.enums.Role;
import com.spandan.auth.infrastructure.kafka.AuthEvent;
import com.spandan.auth.infrastructure.kafka.AuthEventPublisher;
import com.spandan.auth.presentation.dto.request.AdminCreateUserRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateRoleRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateStatusRequest;
import com.spandan.auth.presentation.dto.response.AdminUserResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthEventPublisher eventPublisher;

    public AdminService(UserRepository userRepository,
                        PasswordEncoder passwordEncoder,
                        AuthEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AdminUserResponse createUser(AdminCreateUserRequest request, UUID adminId) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email already in use: " + request.email());
        }

        Role role = Role.valueOf(request.role());
        String passwordHash = passwordEncoder.encode(request.password());
        User user = User.create(request.fullName(), request.email(), passwordHash, role);
        user = userRepository.save(user);

        eventPublisher.publish(new AuthEvent("admin.user.created", user.getId(), user.getRole().name(), Instant.now()));

        log.info("Admin {} created user {} with role {}", adminId, user.getId(), role);
        return toResponse(user);
    }

    @Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED)
    public List<AdminUserResponse> listUsers() {
        return userRepository.findAll().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AdminUserResponse updateUserRole(UUID userId, AdminUpdateRoleRequest request, UUID adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        Role newRole = Role.valueOf(request.role());
        log.info("Admin {} changing user {} role from {} to {}", adminId, userId, user.getRole(), newRole);

        user = new User(
                user.getId(), user.getFullName(), user.getEmail(), user.getPasswordHash(),
                newRole, user.getAccountStatus(), user.getFailedLoginAttempts(),
                user.getLastLoginAt(), user.getCreatedAt(), Instant.now()
        );
        user = userRepository.save(user);

        eventPublisher.publish(new AuthEvent("admin.user.role_changed", userId, newRole.name(), Instant.now()));
        return toResponse(user);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AdminUserResponse updateUserStatus(UUID userId, AdminUpdateStatusRequest request, UUID adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        AccountStatus newStatus = AccountStatus.valueOf(request.status());
        log.info("Admin {} changing user {} status from {} to {}", adminId, userId, user.getAccountStatus(), newStatus);

        user = new User(
                user.getId(), user.getFullName(), user.getEmail(), user.getPasswordHash(),
                user.getRole(), newStatus, user.getFailedLoginAttempts(),
                user.getLastLoginAt(), user.getCreatedAt(), Instant.now()
        );
        user = userRepository.save(user);

        eventPublisher.publish(new AuthEvent("admin.user.status_changed", userId, user.getRole().name(), Instant.now()));
        return toResponse(user);
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getRole().name(),
                user.getAccountStatus().name(),
                user.getFailedLoginAttempts(),
                user.getLastLoginAt(),
                user.getCreatedAt()
        );
    }
}
