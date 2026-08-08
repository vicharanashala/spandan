package com.spandan.gateway.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.gateway.domain.entity.ConnectionSession;
import com.spandan.gateway.domain.enums.UserRole;
import com.spandan.gateway.infrastructure.redis.ConnectionSessionRedisRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class RedisConnectionSessionRepositoryTest {

    private ConnectionSessionRedisRepository repository;
    private StringRedisTemplate redisTemplate;

    @BeforeEach
    void setUp() {
        redisTemplate = new StringRedisTemplate();
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.findAndRegisterModules();
        repository = new ConnectionSessionRedisRepository(redisTemplate, objectMapper, 3600);
    }

    @Test
    void shouldSaveAndFindSession() {
        ConnectionSession session = new ConnectionSession("sess1", "user1", UserRole.STUDENT, "quiz1", "pod1");
        repository.save(session);

        Optional<ConnectionSession> found = repository.findBySessionId("sess1");
        assertTrue(found.isPresent());
        assertEquals("user1", found.get().getUserId());
        assertEquals(UserRole.STUDENT, found.get().getRole());

        repository.deleteBySessionId("sess1");
    }

    @Test
    void shouldReturnEmptyForNonExistentSession() {
        Optional<ConnectionSession> found = repository.findBySessionId("nonexistent");
        assertFalse(found.isPresent());
    }

    @Test
    void shouldDeleteSession() {
        ConnectionSession session = new ConnectionSession("sess2", "user2", UserRole.TEACHER, "quiz2", "pod2");
        repository.save(session);
        repository.deleteBySessionId("sess2");

        Optional<ConnectionSession> found = repository.findBySessionId("sess2");
        assertFalse(found.isPresent());
    }

    @Test
    void shouldFindSessionsByQuizId() {
        ConnectionSession s1 = new ConnectionSession("sess3", "user3", UserRole.STUDENT, "quiz3", "pod3");
        ConnectionSession s2 = new ConnectionSession("sess4", "user4", UserRole.STUDENT, "quiz3", "pod4");
        repository.save(s1);
        repository.save(s2);

        List<ConnectionSession> sessions = repository.findByQuizId("quiz3");
        assertEquals(2, sessions.size());

        repository.deleteBySessionId("sess3");
        repository.deleteBySessionId("sess4");
    }

    @Test
    void shouldCountSessionsByQuizId() {
        ConnectionSession s1 = new ConnectionSession("sess5", "user5", UserRole.STUDENT, "quiz4", "pod5");
        ConnectionSession s2 = new ConnectionSession("sess6", "user6", UserRole.STUDENT, "quiz4", "pod6");
        repository.save(s1);
        repository.save(s2);

        long count = repository.countByQuizId("quiz4");
        assertEquals(2, count);

        repository.deleteBySessionId("sess5");
        repository.deleteBySessionId("sess6");
    }
}
