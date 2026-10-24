package com.spandan.questiongen.infrastructure.redis;

import com.spandan.questiongen.domain.port.LockManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LockRenewalService {

    private static final Logger log = LoggerFactory.getLogger(LockRenewalService.class);

    private final LockManager lockManager;
    private final Map<UUID, String> activeRenewals = new ConcurrentHashMap<>();

    public LockRenewalService(LockManager lockManager) {
        this.lockManager = lockManager;
    }

    public void startRenewal(UUID transcriptId, String podId) {
        activeRenewals.put(transcriptId, podId);
    }

    public void stopRenewal(UUID transcriptId) {
        activeRenewals.remove(transcriptId);
    }

    public boolean isRenewing(UUID transcriptId) {
        return activeRenewals.containsKey(transcriptId);
    }

    public void renewAll() {
        activeRenewals.forEach((transcriptId, podId) -> {
            boolean renewed = lockManager.renewLock(transcriptId, podId);
            if (!renewed) {
                log.warn("Failed to renew lock for transcript {}, removing from renewal queue", transcriptId);
                activeRenewals.remove(transcriptId);
            }
        });
    }
}
