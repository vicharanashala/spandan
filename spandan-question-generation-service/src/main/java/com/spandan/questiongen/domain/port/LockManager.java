package com.spandan.questiongen.domain.port;

import java.util.UUID;

public interface LockManager {
    boolean acquireLock(UUID transcriptId, String podId);
    boolean renewLock(UUID transcriptId, String podId);
    void releaseLock(UUID transcriptId);
}
