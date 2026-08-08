package com.spandan.auth.infrastructure.persistence.adapter;

import com.spandan.auth.application.port.UserRepository;
import com.spandan.auth.domain.entity.User;
import com.spandan.auth.infrastructure.persistence.entity.UserEntity;
import com.spandan.auth.infrastructure.persistence.jpa.JpaUserRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class UserRepositoryAdapter implements UserRepository {

    private final JpaUserRepository jpaUserRepository;

    public UserRepositoryAdapter(JpaUserRepository jpaUserRepository) {
        this.jpaUserRepository = jpaUserRepository;
    }

    @Override
    public Optional<User> findByEmail(String email) {
        return jpaUserRepository.findByEmail(email).map(UserEntity::toDomain);
    }

    @Override
    public Optional<User> findByEmailWithLock(String email) {
        return jpaUserRepository.findByEmailWithLock(email).map(UserEntity::toDomain);
    }

    @Override
    public Optional<User> findById(UUID id) {
        return jpaUserRepository.findById(id).map(UserEntity::toDomain);
    }

    @Override
    public List<User> findAll() {
        return jpaUserRepository.findAll().stream()
                .map(UserEntity::toDomain)
                .toList();
    }

    @Override
    public User save(User user) {
        UserEntity entity = UserEntity.fromDomain(user);
        return jpaUserRepository.save(entity).toDomain();
    }

    @Override
    public boolean existsByEmail(String email) {
        return jpaUserRepository.existsByEmail(email);
    }
}
