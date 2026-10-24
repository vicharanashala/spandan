package com.spandan.polling.application.port;

import com.spandan.polling.domain.entity.QuizQuestion;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuizQuestionRepository {
    List<QuizQuestion> findByQuizIdOrderBySequencePosition(UUID quizId);
    Optional<QuizQuestion> findById(UUID id);
    Optional<QuizQuestion> findByQuizIdAndSequencePosition(UUID quizId, int sequencePosition);
    Optional<QuizQuestion> findByIdWithLock(UUID id);
    boolean existsByQuizIdAndSequencePosition(UUID quizId, int sequencePosition);
    QuizQuestion save(QuizQuestion question);
    List<QuizQuestion> saveAll(List<QuizQuestion> questions);
    long countByQuizId(UUID quizId);
}
