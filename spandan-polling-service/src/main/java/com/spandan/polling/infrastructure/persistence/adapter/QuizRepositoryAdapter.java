package com.spandan.polling.infrastructure.persistence.adapter;

import com.spandan.polling.application.port.QuizRepository;
import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.infrastructure.persistence.entity.QuizEntity;
import com.spandan.polling.infrastructure.persistence.jpa.JpaQuizRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class QuizRepositoryAdapter implements QuizRepository {

    private final JpaQuizRepository jpaRepository;

    public QuizRepositoryAdapter(JpaQuizRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    public Optional<Quiz> findById(UUID id) {
        return jpaRepository.findById(id).map(QuizEntity::toDomain);
    }

    @Override
    public Optional<Quiz> findByIdWithLock(UUID id) {
        return jpaRepository.findByIdWithLock(id).map(QuizEntity::toDomain);
    }

    @Override
    public Quiz save(Quiz quiz) {
        return jpaRepository.save(QuizEntity.fromDomain(quiz)).toDomain();
    }
}
