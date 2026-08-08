package com.spandan.questiongen.application.service;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.entity.QuestionSet;
import com.spandan.questiongen.domain.enums.GenerationStatus;
import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.exception.GenerationException;
import com.spandan.questiongen.domain.port.LockManager;
import com.spandan.questiongen.domain.port.QuestionGenerationProvider;
import com.spandan.questiongen.infrastructure.kafka.producers.QuestionGenerationEventProducer;
import com.spandan.questiongen.infrastructure.persistence.GeneratedQuestionRepository;
import com.spandan.questiongen.infrastructure.persistence.QuestionSetRepository;
import com.spandan.questiongen.infrastructure.provider.ProviderRegistry;
import com.spandan.questiongen.infrastructure.redis.LockRenewalService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class QuestionGenerationOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(QuestionGenerationOrchestrator.class);

    private final QuestionSetRepository questionSetRepository;
    private final GeneratedQuestionRepository generatedQuestionRepository;
    private final LockManager lockManager;
    private final LockRenewalService lockRenewalService;
    private final ProviderRegistry providerRegistry;
    private final QuestionGenerationEventProducer eventProducer;
    private final TranscriptServiceClient transcriptServiceClient;
    private final String generationModel;
    private final String generationVersion;

    public QuestionGenerationOrchestrator(QuestionSetRepository questionSetRepository,
                                          GeneratedQuestionRepository generatedQuestionRepository,
                                          LockManager lockManager, LockRenewalService lockRenewalService,
                                          ProviderRegistry providerRegistry,
                                          QuestionGenerationEventProducer eventProducer,
                                          TranscriptServiceClient transcriptServiceClient,
                                          @Value("${question-generation.generation-model:gpt-4}") String generationModel,
                                          @Value("${question-generation.generation-version:mcq_prompt_v1}") String generationVersion) {
        this.questionSetRepository = questionSetRepository;
        this.generatedQuestionRepository = generatedQuestionRepository;
        this.lockManager = lockManager;
        this.lockRenewalService = lockRenewalService;
        this.providerRegistry = providerRegistry;
        this.eventProducer = eventProducer;
        this.transcriptServiceClient = transcriptServiceClient;
        this.generationModel = generationModel;
        this.generationVersion = generationVersion;
    }

    @Async
    public void requestGeneration(UUID transcriptId, UUID sessionId, UUID teacherId,
                                   UUID lectureId, UUID sectionId, UUID subsectionId) {
        String podId = UUID.randomUUID().toString();
        boolean locked = lockManager.acquireLock(transcriptId, podId);
        if (!locked) {
            log.info("Generation already in progress for transcript {}, skipping", transcriptId);
            return;
        }

        lockRenewalService.startRenewal(transcriptId, podId);
        try {
            int attemptNumber = questionSetRepository
                .findTopByTranscriptIdOrderByAttemptNumberDesc(transcriptId)
                .map(qs -> qs.getAttemptNumber() + 1)
                .orElse(1);

            var questionSet = new QuestionSet();
            questionSet.setSessionId(sessionId);
            questionSet.setTranscriptId(transcriptId);
            questionSet.setTeacherId(teacherId);
            questionSet.setLectureId(lectureId);
            questionSet.setAttemptNumber(attemptNumber);
            questionSet.setGenerationStatus(GenerationStatus.GENERATING);
            questionSet.setExpiryAt(Instant.now().plusSeconds(50 * 3600));
            questionSetRepository.save(questionSet);

            var provider = providerRegistry.getPrimary();
            questionSet.setAiProvider(provider.name());

            String transcriptText = transcriptServiceClient.getTranscriptText(transcriptId);
            if (transcriptText == null || transcriptText.isBlank()) {
                throw GenerationException.badRequest("Transcript text is empty for " + transcriptId);
            }

            String promptTemplate = generationVersion;
            questionSet.setPromptVersion(promptTemplate);

            var request = new QuestionGenerationProvider.GenerationRequest(
                transcriptText, 5, 3, 2, promptTemplate
            );

            var result = provider.generate(request);

            if (!result.success() || result.questions().isEmpty()) {
                var fallback = providerRegistry.getFallback();
                if (fallback.isPresent()) {
                    var fallbackProvider = fallback.get();
                    log.warn("Primary provider {} failed, falling back to {}", provider.name(), fallbackProvider.name());
                    questionSet.setAiProvider(fallbackProvider.name());
                    result = fallbackProvider.generate(request);
                }
            }

            if (!result.success() || result.questions().isEmpty()) {
                questionSet.setGenerationStatus(GenerationStatus.FAILED);
                questionSetRepository.save(questionSet);
                fireAfterCommit(() -> eventProducer.questionGenerationFailed(questionSet,
                    result.errorMessage() != null ? result.errorMessage() : "No questions generated"));
                return;
            }

            Instant now = Instant.now();
            int sequence = 0;

            for (var qData : result.questions()) {
                sequence++;
                var question = new GeneratedQuestion();
                question.setQuestionSet(questionSet);
                question.setQuestionType(QuestionType.valueOf(qData.questionType()));
                question.setQuestionText(qData.questionText());
                question.setCorrectAnswer(qData.correctAnswer());
                question.setLectureId(lectureId);
                question.setSectionId(sectionId);
                question.setSubsectionId(subsectionId);
                question.setDifficulty(qData.difficulty() != null ? qData.difficulty() : "MEDIUM");
                question.setQuestionSequence(sequence);
                question.setGeneratedAt(now);
                question.setGenerationModel(generationModel);
                question.setGenerationVersion(generationVersion);
                try {
                    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    question.setOptions(mapper.writeValueAsString(qData.options()));
                } catch (Exception e) {
                    question.setOptions("{}");
                }
                questionSet.getQuestions().add(question);
            }

            questionSet.setGenerationStatus(GenerationStatus.GENERATED);
            questionSetRepository.save(questionSet);

            fireAfterCommit(() -> {
                eventProducer.questionsGenerated(questionSet);
                eventProducer.questionsStored(questionSet);
                eventProducer.questionsReadyForReview(questionSet);
                for (var question : questionSet.getQuestions()) {
                    eventProducer.questionGeneratedEvent(question, lectureId, sectionId, subsectionId);
                }
            });

        } catch (Exception e) {
            log.error("Question generation failed for transcript {}", transcriptId, e);
        } finally {
            lockRenewalService.stopRenewal(transcriptId);
            lockManager.releaseLock(transcriptId);
        }
    }

    public QuestionSet getById(UUID setId) {
        return questionSetRepository.findById(setId)
            .orElseThrow(() -> GenerationException.notFound("Question set not found: " + setId));
    }

    public QuestionSet getStatus(UUID setId) {
        return getById(setId);
    }

    @Transactional
    public QuestionSet savePermanently(UUID setId) {
        var questionSet = getById(setId);
        if (questionSet.isSavedFlag()) {
            throw GenerationException.conflict("Question set is already saved");
        }
        questionSet.setSavedFlag(true);
        questionSet.setExpiryAt(null);
        questionSetRepository.save(questionSet);
        return questionSet;
    }

    @Transactional
    public void deleteSet(UUID setId) {
        var questionSet = getById(setId);
        questionSetRepository.delete(questionSet);
    }

    @Transactional
    public void regenerate(UUID setId) {
        var existing = getById(setId);
        if (existing.getGenerationStatus() != GenerationStatus.FAILED
            && existing.getGenerationStatus() != GenerationStatus.GENERATED) {
            throw GenerationException.conflict("Can only regenerate FAILED or GENERATED sets");
        }
        requestGeneration(existing.getTranscriptId(), existing.getSessionId(), existing.getTeacherId(),
            existing.getLectureId(), null, null);
    }

    private void fireAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        action.run();
                    }
                }
            );
        } else {
            action.run();
        }
    }
}
