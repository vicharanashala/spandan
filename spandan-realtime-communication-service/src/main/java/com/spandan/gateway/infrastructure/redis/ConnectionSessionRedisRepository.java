package com.spandan.gateway.infrastructure.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.gateway.application.port.ConnectionSessionRepository;
import com.spandan.gateway.domain.entity.ConnectionSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
public class ConnectionSessionRedisRepository implements ConnectionSessionRepository {

    private static final String SESSION_KEY_PREFIX = "session:";
    private static final String QUIZ_SESSIONS_KEY_PREFIX = "quiz_sessions:";
    private static final String USER_SESSIONS_KEY_PREFIX = "user_sessions:";
    private static final String ADMIN_SESSIONS_KEY_PREFIX = "admin_sessions:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final long connectionTtlSeconds;

    public ConnectionSessionRedisRepository(StringRedisTemplate redisTemplate,
                                            ObjectMapper objectMapper,
                                            @Value("${websocket.connection-ttl-seconds}") long connectionTtlSeconds) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.connectionTtlSeconds = connectionTtlSeconds;
    }

    @Override
    public void save(ConnectionSession session) {
        try {
            String sessionKey = SESSION_KEY_PREFIX + session.getSessionId();
            String value = objectMapper.writeValueAsString(session);
            redisTemplate.opsForValue().set(sessionKey, value, Duration.ofSeconds(connectionTtlSeconds));
            redisTemplate.opsForSet().add(QUIZ_SESSIONS_KEY_PREFIX + session.getQuizId(), session.getSessionId());
            redisTemplate.opsForSet().add(USER_SESSIONS_KEY_PREFIX + session.getUserId(), session.getSessionId());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize session", e);
        }
    }

    @Override
    public Optional<ConnectionSession> findBySessionId(String sessionId) {
        String value = redisTemplate.opsForValue().get(SESSION_KEY_PREFIX + sessionId);
        if (value == null) return Optional.empty();
        try {
            return Optional.of(objectMapper.readValue(value, ConnectionSession.class));
        } catch (JsonProcessingException e) {
            return Optional.empty();
        }
    }

    @Override
    public void deleteBySessionId(String sessionId) {
        findBySessionId(sessionId).ifPresent(session -> {
            redisTemplate.delete(SESSION_KEY_PREFIX + sessionId);
            redisTemplate.opsForSet().remove(QUIZ_SESSIONS_KEY_PREFIX + session.getQuizId(), sessionId);
            redisTemplate.opsForSet().remove(USER_SESSIONS_KEY_PREFIX + session.getUserId(), sessionId);
        });
    }

    @Override
    public List<ConnectionSession> findByQuizId(String quizId) {
        Set<String> sessionIds = redisTemplate.opsForSet().members(QUIZ_SESSIONS_KEY_PREFIX + quizId);
        if (sessionIds == null || sessionIds.isEmpty()) return List.of();
        return sessionIds.stream()
                .map(this::findBySessionId)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toList());
    }

    @Override
    public List<ConnectionSession> findByUserId(String userId) {
        Set<String> sessionIds = redisTemplate.opsForSet().members(USER_SESSIONS_KEY_PREFIX + userId);
        if (sessionIds == null || sessionIds.isEmpty()) return List.of();
        return sessionIds.stream()
                .map(this::findBySessionId)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toList());
    }

    @Override
    public long countByQuizId(String quizId) {
        Set<String> sessionIds = redisTemplate.opsForSet().members(QUIZ_SESSIONS_KEY_PREFIX + quizId);
        return sessionIds == null ? 0 : sessionIds.size();
    }

    @Override
    public void addAdminSession(String quizId, String sessionId) {
        redisTemplate.opsForSet().add(ADMIN_SESSIONS_KEY_PREFIX + quizId, sessionId);
    }

    @Override
    public void removeAdminSession(String quizId, String sessionId) {
        redisTemplate.opsForSet().remove(ADMIN_SESSIONS_KEY_PREFIX + quizId, sessionId);
    }

    @Override
    public List<ConnectionSession> findAdminSessionsByQuizId(String quizId) {
        Set<String> sessionIds = redisTemplate.opsForSet().members(ADMIN_SESSIONS_KEY_PREFIX + quizId);
        if (sessionIds == null || sessionIds.isEmpty()) return List.of();
        return sessionIds.stream()
                .map(this::findBySessionId)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toList());
    }

    @Override
    public long countAdminSessionsByQuizId(String quizId) {
        Set<String> sessionIds = redisTemplate.opsForSet().members(ADMIN_SESSIONS_KEY_PREFIX + quizId);
        return sessionIds == null ? 0 : sessionIds.size();
    }
}
