package com.spandan.questiongen.infrastructure.redis;

import com.spandan.questiongen.domain.port.LockManager;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
public class RedisLockManager implements LockManager {

    private static final String LOCK_PREFIX = "transcriptId:";
    private final StringRedisTemplate redisTemplate;
    private final long lockTtlSeconds;

    public RedisLockManager(StringRedisTemplate redisTemplate,
                            @org.springframework.beans.factory.annotation.Value("${question-generation.lock-ttl-seconds:300}") long lockTtlSeconds) {
        this.redisTemplate = redisTemplate;
        this.lockTtlSeconds = lockTtlSeconds;
    }

    @Override
    public boolean acquireLock(UUID transcriptId, String podId) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue()
                .setIfAbsent(LOCK_PREFIX + transcriptId, podId, lockTtlSeconds, TimeUnit.SECONDS)
        );
    }

    @Override
    public boolean renewLock(UUID transcriptId, String podId) {
        var value = redisTemplate.opsForValue().get(LOCK_PREFIX + transcriptId);
        if (!podId.equals(value)) return false;
        return Boolean.TRUE.equals(
            redisTemplate.expire(LOCK_PREFIX + transcriptId, lockTtlSeconds, TimeUnit.SECONDS)
        );
    }

    @Override
    public void releaseLock(UUID transcriptId) {
        redisTemplate.delete(LOCK_PREFIX + transcriptId);
    }
}
