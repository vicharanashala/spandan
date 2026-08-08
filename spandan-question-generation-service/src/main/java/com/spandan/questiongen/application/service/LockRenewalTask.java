package com.spandan.questiongen.application.service;

import com.spandan.questiongen.infrastructure.redis.LockRenewalService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class LockRenewalTask {

    private static final Logger log = LoggerFactory.getLogger(LockRenewalTask.class);

    private final LockRenewalService lockRenewalService;

    public LockRenewalTask(LockRenewalService lockRenewalService) {
        this.lockRenewalService = lockRenewalService;
    }

    @Scheduled(fixedDelayString = "${question-generation.lock-renewal-interval-seconds:60}000")
    public void renewLocks() {
        lockRenewalService.renewAll();
    }
}
