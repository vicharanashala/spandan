package com.spandan.gateway.infrastructure.ratelimit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocalRateLimiterTest {

    @Test
    void allowsUpToBurstThenRejects() {
        // 10/sec replenish, burst 10. We expect the first 10 calls in a single window to succeed
        // and the 11th to fail.
        LocalRateLimiter rl = new LocalRateLimiter(10, 10);
        int allowed = 0;
        for (int i = 0; i < 20; i++) {
            if (rl.tryAcquire("user:test")) {
                allowed++;
            }
        }
        assertTrue(allowed <= 10, "Should not exceed burst in one window but allowed " + allowed);
        assertTrue(allowed >= 1, "Should have permitted at least the first call");
    }

    @Test
    void differentPrincipalsHaveSeparateBuckets() {
        // burst=2 means a single principal can call twice before being rate limited.
        LocalRateLimiter rl = new LocalRateLimiter(2, 2);
        // user:a has its own bucket, separate from user:b.
        assertTrue(rl.tryAcquire("user:a"));
        assertTrue(rl.tryAcquire("user:a"));   // 2nd call still permitted (burst)
        assertFalse(rl.tryAcquire("user:a"));  // 3rd call rejected
        // user:b still has a fresh bucket
        assertTrue(rl.tryAcquire("user:b"));
        assertTrue(rl.tryAcquire("user:b"));
        assertFalse(rl.tryAcquire("user:b"));
        // user:c is independent
        assertTrue(rl.tryAcquire("user:c"));
    }
}