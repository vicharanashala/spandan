package com.spandan.gateway.infrastructure.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;

@Component
public class RedisRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    private static final String LUA_SCRIPT = """
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local window_start = now - (now % window)
            local window_key = key .. ':' .. window_start
            local current = redis.call('GET', window_key)
            if current and tonumber(current) >= limit then
                return 0
            end
            redis.call('INCR', window_key)
            redis.call('EXPIRE', window_key, window * 2)
            return 1
            """;

    private final ReactiveStringRedisTemplate redis;
    private final RedisScript<Long> script;

    public RedisRateLimiter(ReactiveStringRedisTemplate redis) {
        this.redis = redis;
        this.script = RedisScript.of(LUA_SCRIPT, Long.class);
    }

    public Mono<Boolean> tryAcquire(String key, int limit, long windowSeconds) {
        long now = System.currentTimeMillis() / 1000;
        List<String> keys = List.of(key);

        return redis.execute(script, keys, String.valueOf(limit), String.valueOf(windowSeconds), String.valueOf(now))
                .map(result -> result != null && result == 1)
                .onErrorResume(e -> {
                    log.warn("Redis rate limiter failed, allowing request: {}", e.getMessage());
                    return Mono.just(true);
                });
    }

    public Mono<Boolean> ping() {
        return redis.getConnectionFactory().getReactiveConnection().ping()
                .hasElement()
                .onErrorReturn(false);
    }

}
