package com.spandan.gateway.infrastructure.ratelimit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Fallback rate limiter when Redis is unreachable. Implements a simple sliding-window
 * counter per principal.
 *
 * <p>This is intentionally simple — the production path uses {@link RedisRateLimiter};
 * local limiting is here so the gateway doesn't become a gateway to DOS when Redis is down.
 *
 * <p>Note: with a single-pod Redis outage, this preserves the per-instance quota only.
 * Cross-pod accuracy is not guaranteed in this fallback path. This is acceptable behavior —
 * the alternative (failing closed) would mean one bad Redis node takes down all 12 pods.
 */
@Component
public class LocalRateLimiter {

    private final long permitsPerSecond;
    private final long burst;

    public LocalRateLimiter(
            @Value("${ratelimit.local.replenish-per-second:20}") long permitsPerSecond,
            @Value("${ratelimit.local.burst:50}") long burst) {
        this.permitsPerSecond = permitsPerSecond;
        this.burst = burst;
    }

    private final ConcurrentHashMap<String, WindowCounter> counters = new ConcurrentHashMap<>();

    /**
     * Returns true if the call is permitted for the given principal.
     */
    public boolean tryAcquire(String principalKey) {
        WindowCounter counter = counters.computeIfAbsent(principalKey, k -> new WindowCounter());
        return counter.tryConsume(permitsPerSecond, burst);
    }

    /** Counter is reset every second; tokens replenish at the configured rate. */
    static final class WindowCounter {
        private final AtomicLong tokens;
        private volatile long windowEndNanos;

        WindowCounter() {
            this.tokens = new AtomicLong(0);
            this.windowEndNanos = System.nanoTime();
        }

        synchronized boolean tryConsume(long permitsPerSecond, long burst) {
            long now = System.nanoTime();
            if (now >= windowEndNanos) {
                long elapsedWindows = (now - windowEndNanos) / 1_000_000_000L + 1;
                windowEndNanos += elapsedWindows * 1_000_000_000L;
                long refill = elapsedWindows * permitsPerSecond;
                long next = Math.min(burst, tokens.get() + refill);
                tokens.set(next);
            }
            long current = tokens.get();
            if (current <= 0) {
                return false;
            }
            tokens.decrementAndGet();
            return true;
        }
    }
}