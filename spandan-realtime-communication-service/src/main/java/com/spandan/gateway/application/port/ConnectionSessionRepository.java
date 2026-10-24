package com.spandan.gateway.application.port;

import com.spandan.gateway.domain.entity.ConnectionSession;

import java.util.List;
import java.util.Optional;

public interface ConnectionSessionRepository {
    void save(ConnectionSession session);
    Optional<ConnectionSession> findBySessionId(String sessionId);
    void deleteBySessionId(String sessionId);
    List<ConnectionSession> findByQuizId(String quizId);
    List<ConnectionSession> findByUserId(String userId);
    long countByQuizId(String quizId);
    void addAdminSession(String quizId, String sessionId);
    void removeAdminSession(String quizId, String sessionId);
    List<ConnectionSession> findAdminSessionsByQuizId(String quizId);
    long countAdminSessionsByQuizId(String quizId);
}
