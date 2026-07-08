package com.spandan.auth.application.service;

import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.domain.enums.AccountStatus;
import com.spandan.auth.domain.enums.Role;
import com.spandan.auth.infrastructure.kafka.AuthEventPublisher;
import com.spandan.auth.presentation.dto.request.AdminCreateUserRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateRoleRequest;
import com.spandan.auth.presentation.dto.request.AdminUpdateStatusRequest;
import com.spandan.auth.presentation.dto.response.AdminUserResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private AuthEventPublisher eventPublisher;

    private PasswordEncoder passwordEncoder;
    private AdminService adminService;
    private UUID adminId;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder(4);
        adminService = new AdminService(userRepository, passwordEncoder, eventPublisher);
        adminId = UUID.randomUUID();
    }

    @Test
    void createUserSuccess() {
        when(userRepository.existsByEmail("new@test.com")).thenReturn(false);
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponse response = adminService.createUser(
                new AdminCreateUserRequest("New User", "new@test.com", "password123", "TEACHER"),
                adminId
        );

        assertNotNull(response);
        assertEquals("new@test.com", response.email());
        assertEquals("TEACHER", response.role());
        assertEquals("ACTIVE", response.accountStatus());
        verify(userRepository).save(any());
        verify(eventPublisher).publish(any());
    }

    @Test
    void createUserDuplicateEmail() {
        when(userRepository.existsByEmail("dup@test.com")).thenReturn(true);

        assertThrows(IllegalArgumentException.class,
                () -> adminService.createUser(
                        new AdminCreateUserRequest("Dup", "dup@test.com", "password123", "STUDENT"),
                        adminId
                ));
        verify(userRepository, never()).save(any());
    }

    @Test
    void createAdminUser() {
        when(userRepository.existsByEmail("admin2@test.com")).thenReturn(false);
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponse response = adminService.createUser(
                new AdminCreateUserRequest("Admin 2", "admin2@test.com", "adminpass", "ADMIN"),
                adminId
        );

        assertEquals("ADMIN", response.role());
        assertEquals("ACTIVE", response.accountStatus());
    }

    @Test
    void listUsers() {
        User u1 = User.create("User A", "a@test.com", "hash", Role.TEACHER);
        User u2 = User.create("User B", "b@test.com", "hash", Role.STUDENT);

        when(userRepository.findAll()).thenReturn(List.of(u1, u2));

        List<AdminUserResponse> users = adminService.listUsers();
        assertEquals(2, users.size());
    }

    @Test
    void updateUserRole() {
        UUID userId = UUID.randomUUID();
        User user = User.create("Target", "target@test.com", "hash", Role.TEACHER);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponse response = adminService.updateUserRole(
                userId, new AdminUpdateRoleRequest("ADMIN"), adminId
        );

        assertEquals("ADMIN", response.role());
        verify(eventPublisher).publish(any());
    }

    @Test
    void updateUserStatus() {
        UUID userId = UUID.randomUUID();
        User user = User.create("Target", "target@test.com", "hash", Role.TEACHER);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AdminUserResponse response = adminService.updateUserStatus(
                userId, new AdminUpdateStatusRequest("LOCKED"), adminId
        );

        assertEquals("LOCKED", response.accountStatus());
        verify(eventPublisher).publish(any());
    }

    @Test
    void updateUserRoleUserNotFound() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> adminService.updateUserRole(userId, new AdminUpdateRoleRequest("STUDENT"), adminId));
    }
}
