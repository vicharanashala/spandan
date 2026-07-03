package com.spandan.auth.infrastructure.redis;

import com.spandan.auth.application.port.TokenBlacklistPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class RedisTokenBlacklistAdapter implements TokenBlacklistPort {

    private static final String BLACKLIST_PREFIX = "jti:";

    private final StringRedisTemplate redisTemplate;

    public RedisTokenBlacklistAdapter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void blacklist(String jti, long ttlSeconds) {
        redisTemplate.opsForValue()
                .setIfAbsent(BLACKLIST_PREFIX + jti, "revoked", ttlSeconds, TimeUnit.SECONDS);
    }

    @Override
    public boolean isBlacklisted(String jti) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + jti));
    }
}
