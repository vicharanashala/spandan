package com.spandan.gateway.infrastructure.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.gateway.application.port.ActivePollRepository;
import com.spandan.gateway.domain.entity.ActivePoll;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ActivePollRedisRepository implements ActivePollRepository {

    private static final String KEY_PREFIX = "active_poll:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final int gracePeriodSeconds;

    public ActivePollRedisRepository(StringRedisTemplate redisTemplate,
                                     ObjectMapper objectMapper,
                                     @Value("${rtc.poll-grace-period-seconds:30}") int gracePeriodSeconds) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.gracePeriodSeconds = gracePeriodSeconds;
    }

    private String key(String sessionId) {
        return KEY_PREFIX + sessionId;
    }

    @Override
    public void save(ActivePoll poll) {
        try {
            String json = objectMapper.writeValueAsString(poll);
            long ttl = (poll.getPollDurationMs() / 1000) + gracePeriodSeconds;
            redisTemplate.opsForValue().set(key(poll.getSessionId()), json, ttl, TimeUnit.SECONDS);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize ActivePoll", e);
        }
    }

    @Override
    public Optional<ActivePoll> findBySessionId(String sessionId) {
        String json = redisTemplate.opsForValue().get(key(sessionId));
        if (json == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(json, ActivePoll.class));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize ActivePoll", e);
        }
    }

    @Override
    public void deleteBySessionId(String sessionId) {
        redisTemplate.delete(key(sessionId));
    }

    @Override
    public List<ActivePoll> findAllActive() {
        return Collections.emptyList();
    }
}
