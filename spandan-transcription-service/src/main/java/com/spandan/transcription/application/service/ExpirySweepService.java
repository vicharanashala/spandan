package com.spandan.transcription.application.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ExpirySweepService {

    private static final Logger log = LoggerFactory.getLogger(ExpirySweepService.class);
    private final TranscriptionOrchestrator orchestrator;

    public ExpirySweepService(TranscriptionOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @Scheduled(fixedDelayString = "${transcription.expiry-sweep-interval-ms:900000}")
    public void sweep() {
        log.debug("Running transcript expiry sweep");
        orchestrator.expireTranscripts();
    }

    @Scheduled(fixedDelayString = "${transcription.gap-timeout-ms:30000}")
    public void sweepStaleBuffers() {
        orchestrator.sweepStaleBuffers();
    }
}
