package com.spandan.response.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.response.domain.entity.Interaction;
import com.spandan.response.domain.entity.QuestionMetadata;
import com.spandan.response.domain.entity.RawEvent;
import com.spandan.response.infrastructure.kafka.producers.ResponseEventProducer;
import com.spandan.response.infrastructure.persistence.InteractionRepository;
import com.spandan.response.infrastructure.persistence.QuestionMetadataRepository;
import com.spandan.response.infrastructure.persistence.RawEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class InteractionService {

    private static final Logger log = LoggerFactory.getLogger(InteractionService.class);
    private static final String EVENT_VERSION = "1.0";

    private final InteractionRepository interactionRepository;
    private final QuestionMetadataRepository questionMetadataRepository;
    private final RawEventRepository rawEventRepository;
    private final ResponseEventProducer eventProducer;
    private final ObjectMapper objectMapper;
    private final boolean deferOnMissingMetadata;

    public InteractionService(InteractionRepository interactionRepository,
                              QuestionMetadataRepository questionMetadataRepository,
                              RawEventRepository rawEventRepository,
                              ResponseEventProducer eventProducer,
                              ObjectMapper objectMapper,
                              @Value("${response.correctness.defer-on-missing-metadata:true}") boolean deferOnMissingMetadata) {
        this.interactionRepository = interactionRepository;
        this.questionMetadataRepository = questionMetadataRepository;
        this.rawEventRepository = rawEventRepository;
        this.eventProducer = eventProducer;
        this.objectMapper = objectMapper;
        this.deferOnMissingMetadata = deferOnMissingMetadata;
    }

    @Transactional
    public void handleDisplayed(Map<String, Object> event) {
        UUID eventId = uuid(event, "eventId");
        if (eventId == null || interactionRepository.findByEventId(eventId).isPresent()) {
            return; // duplicate
        }

        storeRawEvent(eventId, "DISPLAYED", event);

        Interaction interaction = new Interaction();
        interaction.setEventId(eventId);
        interaction.setEventType("DISPLAYED");
        interaction.setEventTimestamp(instant(event, "eventTimestamp"));
        interaction.setSessionId(uuid(event, "sessionId"));
        interaction.setLectureId(uuid(event, "lectureId"));
        interaction.setStudentId(uuid(event, "studentId"));
        interaction.setQuestionId(uuid(event, "questionId"));
        interaction.setSectionId(uuid(event, "sectionId"));
        interaction.setSubsectionId(uuid(event, "subsectionId"));
        interaction.setTopicId(uuid(event, "topicId"));
        interaction.setConceptId(uuid(event, "conceptId"));
        interaction.setLearningObjective(str(event, "learningObjective"));
        interaction.setQuestionSequence(intObj(event, "questionSequence"));
        interaction.setQuestionDisplayedAt(instant(event, "questionDisplayedAt"));
        interaction.setEventVersion(EVENT_VERSION);

        // Look up question metadata for type/difficulty
        questionMetadataRepository.findByQuestionId(interaction.getQuestionId()).ifPresent(qm -> {
            if (interaction.getQuestionType() == null) interaction.setQuestionType(qm.getQuestionType());
            if (interaction.getDifficulty() == null) interaction.setDifficulty(qm.getDifficulty());
        });

        interaction = interactionRepository.save(interaction);
        eventProducer.interactionPersisted(interaction.getId(), interaction.getSessionId(),
                interaction.getStudentId(), interaction.getQuestionId(), "DISPLAYED", null);
        log.debug("Displayed interaction persisted: eventId={}, studentId={}, questionId={}",
                eventId, interaction.getStudentId(), interaction.getQuestionId());
    }

    @Transactional
    public void handleAnswered(Map<String, Object> event) {
        UUID eventId = uuid(event, "eventId");
        if (eventId == null || interactionRepository.findByEventId(eventId).isPresent()) {
            return;
        }

        storeRawEvent(eventId, "ANSWERED", event);

        UUID studentId = uuid(event, "studentId");
        UUID questionId = uuid(event, "questionId");
        String selectedAnswer = str(event, "selectedAnswer");

        // Try to find existing interaction by student+question
        Interaction interaction = interactionRepository.findBySessionIdAndQuestionIdAndStudentId(
                uuid(event, "sessionId"), questionId, studentId).orElse(new Interaction());

        boolean isNew = interaction.getId() == null;
        if (isNew) {
            interaction.setEventId(eventId);
            interaction.setEventType("ANSWERED");
            interaction.setSessionId(uuid(event, "sessionId"));
            interaction.setLectureId(uuid(event, "lectureId"));
            interaction.setStudentId(studentId);
            interaction.setQuestionId(questionId);
            interaction.setEventVersion(EVENT_VERSION);
        }

        interaction.setEventTimestamp(instant(event, "eventTimestamp"));
        interaction.setQuestionDisplayedAt(instant(event, "questionDisplayedAt"));
        interaction.setQuestionAnsweredAt(instant(event, "questionAnsweredAt"));
        interaction.setResponseTimeMs(longObj(event, "responseTimeMilliseconds"));
        interaction.setSelectedAnswer(selectedAnswer);
        interaction.setAnswered(true);
        interaction.setTimeout(false);

        // Determine correctness
        UUID qId = interaction.getQuestionId();
        questionMetadataRepository.findByQuestionId(qId).ifPresentOrElse(qm -> {
            interaction.setCorrectAnswer(qm.getCorrectAnswer());
            if (selectedAnswer != null && qm.getCorrectAnswer() != null) {
                interaction.setIsCorrect(selectedAnswer.equals(qm.getCorrectAnswer()));
                if (interaction.getQuestionType() == null) interaction.setQuestionType(qm.getQuestionType());
                if (interaction.getDifficulty() == null) interaction.setDifficulty(qm.getDifficulty());
            }
        }, () -> {
            if (!deferOnMissingMetadata) {
                log.warn("No metadata found for questionId={}, correctness cannot be determined", qId);
            }
        });

        interaction = interactionRepository.save(interaction);
        eventProducer.interactionPersisted(interaction.getId(), interaction.getSessionId(),
                interaction.getStudentId(), interaction.getQuestionId(), "ANSWERED", interaction.getIsCorrect());
        log.info("Answered interaction persisted: studentId={}, questionId={}, isCorrect={}",
                studentId, questionId, interaction.getIsCorrect());
    }

    @Transactional
    public void handleTimedOut(Map<String, Object> event) {
        UUID eventId = uuid(event, "eventId");
        if (eventId == null || interactionRepository.findByEventId(eventId).isPresent()) {
            return;
        }

        storeRawEvent(eventId, "TIMED_OUT", event);

        UUID studentId = uuid(event, "studentId");
        UUID questionId = uuid(event, "questionId");

        Interaction interaction = interactionRepository.findBySessionIdAndQuestionIdAndStudentId(
                uuid(event, "sessionId"), questionId, studentId).orElse(new Interaction());

        boolean isNew = interaction.getId() == null;
        if (isNew) {
            interaction.setEventId(eventId);
            interaction.setEventType("TIMED_OUT");
            interaction.setSessionId(uuid(event, "sessionId"));
            interaction.setLectureId(uuid(event, "lectureId"));
            interaction.setStudentId(studentId);
            interaction.setQuestionId(questionId);
            interaction.setEventVersion(EVENT_VERSION);
        }

        interaction.setEventTimestamp(instant(event, "eventTimestamp"));
        interaction.setQuestionDisplayedAt(instant(event, "questionDisplayedAt"));
        interaction.setTimeout(true);
        interaction.setAnswered(false);

        interaction = interactionRepository.save(interaction);
        eventProducer.interactionPersisted(interaction.getId(), interaction.getSessionId(),
                interaction.getStudentId(), interaction.getQuestionId(), "TIMED_OUT", null);
        log.debug("Timeout interaction persisted: studentId={}, questionId={}", studentId, questionId);
    }

    private void storeRawEvent(UUID eventId, String eventType, Map<String, Object> event) {
        try {
            RawEvent raw = new RawEvent();
            raw.setEventId(eventId);
            raw.setEventType(eventType);
            raw.setEventPayload(objectMapper.writeValueAsString(event));
            rawEventRepository.save(raw);
        } catch (Exception e) {
            log.warn("Failed to store raw event: eventId={}", eventId, e);
        }
    }

    private UUID uuid(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        try { return UUID.fromString(v.toString()); } catch (Exception e) { return null; }
    }

    private Instant instant(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        try { return Instant.parse(v.toString()); } catch (Exception e) { return null; }
    }

    private String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }

    private Integer intObj(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        if (v != null) { try { return Integer.parseInt(v.toString()); } catch (Exception e) { } }
        return null;
    }

    private Long longObj(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.longValue();
        if (v != null) { try { return Long.parseLong(v.toString()); } catch (Exception e) { } }
        return null;
    }
}
