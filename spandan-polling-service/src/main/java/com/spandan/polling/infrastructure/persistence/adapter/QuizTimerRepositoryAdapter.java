package com.spandan.polling.infrastructure.persistence.adapter;

import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.TimerStatus;
import com.spandan.polling.infrastructure.persistence.entity.QuizTimerEntity;
import com.spandan.polling.infrastructure.persistence.jpa.JpaQuizTimerRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class QuizTimerRepositoryAdapter implements QuizTimerRepository {

    private final JpaQuizTimerRepository jpaRepository;

    public QuizTimerRepositoryAdapter(JpaQuizTimerRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    public Optional<QuizTimer> findByQuizQuestionId(UUID quizQuestionId) {
        return jpaRepository.findByQuizQuestionId(quizQuestionId).map(QuizTimerEntity::toDomain);
    }

    @Override
    public List<QuizTimer> findByTimerStatus(TimerStatus status) {
        return jpaRepository.findByTimerStatus(status)
                .stream().map(QuizTimerEntity::toDomain).toList();
    }

    @Override
    public List<QuizTimer> findExpiredRunningTimers(long maxDurationSeconds) {
        return jpaRepository.findExpiredRunningTimers()
                .stream().map(QuizTimerEntity::toDomain).toList();
    }

    @Override
    public QuizTimer save(QuizTimer timer) {
        return jpaRepository.save(QuizTimerEntity.fromDomain(timer)).toDomain();
    }
}
