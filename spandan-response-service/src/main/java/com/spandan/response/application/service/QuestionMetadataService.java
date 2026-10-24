package com.spandan.response.application.service;

import com.spandan.response.domain.entity.QuestionMetadata;
import com.spandan.response.infrastructure.persistence.QuestionMetadataRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class QuestionMetadataService {

    private static final Logger log = LoggerFactory.getLogger(QuestionMetadataService.class);
    private final QuestionMetadataRepository repository;

    public QuestionMetadataService(QuestionMetadataRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void processQuestionGeneratedEvent(Map<String, Object> event) {
        UUID questionId = uuid(event, "questionId");
        if (questionId == null) {
            log.warn("QuestionGeneratedEvent missing questionId");
            return;
        }

        QuestionMetadata metadata = repository.findByQuestionId(questionId)
                .orElse(new QuestionMetadata());
        metadata.setQuestionId(questionId);
        if (event.containsKey("correctAnswer")) metadata.setCorrectAnswer(str(event, "correctAnswer"));
        if (event.containsKey("questionType")) metadata.setQuestionType(str(event, "questionType"));
        if (event.containsKey("difficulty")) metadata.setDifficulty(str(event, "difficulty"));
        if (event.containsKey("lectureId")) metadata.setLectureId(uuid(event, "lectureId"));
        if (event.containsKey("sectionId")) metadata.setSectionId(uuid(event, "sectionId"));
        if (event.containsKey("subsectionId")) metadata.setSubsectionId(uuid(event, "subsectionId"));
        if (event.containsKey("topicId")) metadata.setTopicId(uuid(event, "topicId"));
        if (event.containsKey("conceptId")) metadata.setConceptId(uuid(event, "conceptId"));
        if (event.containsKey("learningObjective")) metadata.setLearningObjective(str(event, "learningObjective"));
        if (event.containsKey("questionSequence")) metadata.setQuestionSequence(intObj(event, "questionSequence"));

        repository.save(metadata);
        log.debug("Question metadata stored: questionId={}", questionId);
    }

    private UUID uuid(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        try { return UUID.fromString(v.toString()); } catch (Exception e) { return null; }
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
}
