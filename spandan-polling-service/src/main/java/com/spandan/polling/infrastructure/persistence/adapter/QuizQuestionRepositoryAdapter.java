package com.spandan.polling.infrastructure.persistence.adapter;

import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.infrastructure.persistence.entity.QuizQuestionEntity;
import com.spandan.polling.infrastructure.persistence.jpa.JpaQuizQuestionRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class QuizQuestionRepositoryAdapter implements QuizQuestionRepository {

    private final JpaQuizQuestionRepository jpaRepository;

    public QuizQuestionRepositoryAdapter(JpaQuizQuestionRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    public List<QuizQuestion> findByQuizIdOrderBySequencePosition(UUID quizId) {
        return jpaRepository.findByQuizIdOrderBySequencePosition(quizId)
                .stream().map(QuizQuestionEntity::toDomain).toList();
    }

    @Override
    public Optional<QuizQuestion> findById(UUID id) {
        return jpaRepository.findById(id).map(QuizQuestionEntity::toDomain);
    }

    @Override
    public Optional<QuizQuestion> findByQuizIdAndSequencePosition(UUID quizId, int sequencePosition) {
        return jpaRepository.findByQuizIdAndSequencePosition(quizId, sequencePosition)
                .map(QuizQuestionEntity::toDomain);
    }

    @Override
    public Optional<QuizQuestion> findByIdWithLock(UUID id) {
        return jpaRepository.findByIdWithLock(id).map(QuizQuestionEntity::toDomain);
    }

    @Override
    public boolean existsByQuizIdAndSequencePosition(UUID quizId, int sequencePosition) {
        return jpaRepository.existsByQuizIdAndSequencePosition(quizId, sequencePosition);
    }

    @Override
    public QuizQuestion save(QuizQuestion question) {
        return jpaRepository.save(QuizQuestionEntity.fromDomain(question)).toDomain();
    }

    @Override
    public List<QuizQuestion> saveAll(List<QuizQuestion> questions) {
        return jpaRepository.saveAll(
                questions.stream().map(QuizQuestionEntity::fromDomain).toList()
        ).stream().map(QuizQuestionEntity::toDomain).toList();
    }

    @Override
    public long countByQuizId(UUID quizId) {
        return jpaRepository.countByQuizId(quizId);
    }
}
