package com.spandan.auth.application.port;

import com.spandan.auth.domain.entity.User;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailWithLock(String email);
    Optional<User> findById(UUID id);
    User save(User user);
    boolean existsByEmail(String email);
}
