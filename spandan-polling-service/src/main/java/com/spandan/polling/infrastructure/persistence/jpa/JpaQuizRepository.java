package com.spandan.polling.infrastructure.persistence.jpa;

import com.spandan.polling.infrastructure.persistence.entity.QuizEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface JpaQuizRepository extends JpaRepository<QuizEntity, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT q FROM QuizEntity q WHERE q.id = :id")
    Optional<QuizEntity> findByIdWithLock(UUID id);
}
