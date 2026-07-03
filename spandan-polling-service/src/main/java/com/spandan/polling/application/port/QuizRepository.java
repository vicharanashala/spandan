package com.spandan.polling.application.port;

import com.spandan.polling.domain.entity.Quiz;

import java.util.Optional;
import java.util.UUID;

public interface QuizRepository {
    Optional<Quiz> findById(UUID id);
    Optional<Quiz> findByIdWithLock(UUID id);
    Quiz save(Quiz quiz);
}
