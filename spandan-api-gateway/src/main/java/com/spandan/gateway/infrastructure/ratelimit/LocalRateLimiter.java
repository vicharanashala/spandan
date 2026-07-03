package com.spandan.gateway.infrastructure.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class LocalRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(LocalRateLimiter.class);

    private final ConcurrentMap<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public boolean tryAcquire(String key, int limit, long windowSeconds) {
        long now = System.currentTimeMillis() / 1000;
        long windowKey = now / windowSeconds;

        String compositeKey = key + ":" + windowKey;

        WindowCounter counter = counters.compute(compositeKey, (k, existing) -> {
            if (existing == null) {
                return new WindowCounter(1);
            }
            if (existing.count.get() >= limit) {
                return existing;
            }
            existing.count.incrementAndGet();
            return existing;
        });

        if (counter.count.get() > limit) {
            counters.computeIfPresent(compositeKey, (k, c) -> {
                if (c.count.get() > limit) {
                    c.count.decrementAndGet();
                }
                return c;
            });
            return false;
        }

        cleanup(now, windowSeconds);
        return true;
    }

    private void cleanup(long nowSeconds, long windowSeconds) {
        if (counters.size() > 10000) {
            long cutoff = nowSeconds - windowSeconds * 2;
            counters.entrySet().removeIf(e -> {
                String[] parts = e.getKey().split(":");
                if (parts.length < 2) return true;
                try {
                    long keyWindow = Long.parseLong(parts[parts.length - 1]);
                    return keyWindow < cutoff / windowSeconds;
                } catch (NumberFormatException ex) {
                    return true;
                }
            });
            log.debug("Rate limiter cleanup: {} entries remaining", counters.size());
        }
    }

    private static class WindowCounter {
        final AtomicInteger count;

        WindowCounter(int initial) {
            this.count = new AtomicInteger(initial);
        }
    }

}
