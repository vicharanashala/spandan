package com.spandan.questiongen.application.service;

import com.spandan.questiongen.infrastructure.kafka.producers.QuestionGenerationEventProducer;
import com.spandan.questiongen.infrastructure.persistence.QuestionSetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ExpiredSetSweeper {

    private static final Logger log = LoggerFactory.getLogger(ExpiredSetSweeper.class);

    private final QuestionSetRepository questionSetRepository;
    private final QuestionGenerationEventProducer eventProducer;

    public ExpiredSetSweeper(QuestionSetRepository questionSetRepository,
                             QuestionGenerationEventProducer eventProducer) {
        this.questionSetRepository = questionSetRepository;
        this.eventProducer = eventProducer;
    }

    @Transactional
    @Scheduled(fixedDelayString = "${question-generation.expiry-sweep-interval-ms:900000}")
    public void sweepExpiredSets() {
        var expired = questionSetRepository.findExpiredUnsavedSets(Instant.now());
        if (expired.isEmpty()) return;

        log.info("Sweeping {} expired unsaved question sets", expired.size());
        for (var set : expired) {
            eventProducer.temporaryQuestionsExpired(set);
            questionSetRepository.delete(set);
            log.info("Deleted expired question set {}", set.getId());
        }
    }
}
