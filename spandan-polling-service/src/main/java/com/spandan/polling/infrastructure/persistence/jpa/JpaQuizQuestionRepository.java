package com.spandan.polling.infrastructure.persistence.jpa;

import com.spandan.polling.infrastructure.persistence.entity.QuizQuestionEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JpaQuizQuestionRepository extends JpaRepository<QuizQuestionEntity, UUID> {

    List<QuizQuestionEntity> findByQuizIdOrderBySequencePosition(UUID quizId);

    Optional<QuizQuestionEntity> findByQuizIdAndSequencePosition(UUID quizId, int sequencePosition);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT q FROM QuizQuestionEntity q WHERE q.id = :id")
    Optional<QuizQuestionEntity> findByIdWithLock(UUID id);

    boolean existsByQuizIdAndSequencePosition(UUID quizId, int sequencePosition);

    long countByQuizId(UUID quizId);
}
