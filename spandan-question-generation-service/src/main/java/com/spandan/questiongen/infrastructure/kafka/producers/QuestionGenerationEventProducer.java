package com.spandan.questiongen.infrastructure.kafka.producers;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.entity.QuestionSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Component
public class QuestionGenerationEventProducer {

    private static final Logger log = LoggerFactory.getLogger(QuestionGenerationEventProducer.class);
    private static final String TOPIC = "question-generation-events";

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public QuestionGenerationEventProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void questionsGenerated(QuestionSet questionSet) {
        var event = new QuestionsGeneratedEvent(
            questionSet.getId(),
            questionSet.getTranscriptId(),
            questionSet.getSessionId(),
            questionSet.getTeacherId(),
            questionSet.getAttemptNumber(),
            questionSet.getAiProvider()
        );
        send("QuestionsGenerated", event);
    }

    public void questionGenerationFailed(QuestionSet questionSet, String reason) {
        var event = new QuestionGenerationFailedEvent(
            questionSet.getId(),
            questionSet.getTranscriptId(),
            questionSet.getSessionId(),
            questionSet.getTeacherId(),
            questionSet.getAttemptNumber(),
            reason
        );
        send("QuestionGenerationFailed", event);
    }

    public void questionsStored(QuestionSet questionSet) {
        var event = new QuestionsStoredEvent(
            questionSet.getId(),
            questionSet.getTranscriptId(),
            questionSet.getSessionId(),
            questionSet.getAttemptNumber()
        );
        send("QuestionsStored", event);
    }

    public void questionsReadyForReview(QuestionSet questionSet) {
        var questions = questionSet.getQuestions().stream()
            .map(q -> new QuestionData(q.getId(), q.getQuestionType().name(),
                                       q.getQuestionText(), q.getOptions(), q.getCorrectAnswer()))
            .toList();
        var event = new QuestionsReadyForReviewEvent(
            questionSet.getId(),
            questionSet.getTranscriptId(),
            questionSet.getSessionId(),
            questionSet.getTeacherId(),
            questionSet.getAttemptNumber(),
            questions
        );
        send("QuestionsReadyForReview", event);
    }

    public void questionGeneratedEvent(GeneratedQuestion question, UUID lectureId, UUID sectionId, UUID subsectionId) {
        var event = new QuestionGeneratedEvent(
            question.getId(),
            question.getQuestionText(),
            question.getQuestionType().name(),
            question.getOptions(),
            question.getCorrectAnswer(),
            lectureId,
            sectionId,
            subsectionId,
            question.getTopicId(),
            question.getConceptId(),
            question.getLearningObjective(),
            question.getDifficulty(),
            question.getQuestionSequence(),
            question.getGeneratedAt(),
            question.getGenerationModel(),
            question.getGenerationVersion()
        );
        send("QuestionGeneratedEvent", event);
    }

    public void temporaryQuestionsExpired(QuestionSet questionSet) {
        var event = new TemporaryQuestionsExpiredEvent(
            questionSet.getId(),
            questionSet.getTranscriptId(),
            questionSet.getSessionId(),
            questionSet.getAttemptNumber()
        );
        send("TemporaryQuestionsExpired", event);
    }

    private void send(String key, Object event) {
        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(TOPIC, key, event);
        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to send {} event to {}", key, TOPIC, ex);
            } else {
                log.debug("Sent {} event to {} at offset {}", key, TOPIC, result.getRecordMetadata().offset());
            }
        });
    }

    public record QuestionsGeneratedEvent(java.util.UUID setId, java.util.UUID transcriptId,
                                           java.util.UUID sessionId, java.util.UUID teacherId,
                                           int attemptNumber, String aiProvider) {}
    public record QuestionGenerationFailedEvent(java.util.UUID setId, java.util.UUID transcriptId,
                                                 java.util.UUID sessionId, java.util.UUID teacherId,
                                                 int attemptNumber, String reason) {}
    public record QuestionsStoredEvent(java.util.UUID setId, java.util.UUID transcriptId,
                                        java.util.UUID sessionId, int attemptNumber) {}
    public record QuestionData(java.util.UUID id, String questionType, String questionText,
                                String options, String correctAnswer) {}
    public record QuestionsReadyForReviewEvent(java.util.UUID setId, java.util.UUID transcriptId,
                                                 java.util.UUID sessionId, java.util.UUID teacherId,
                                                 int attemptNumber, java.util.List<QuestionData> questions) {}
    public record TemporaryQuestionsExpiredEvent(java.util.UUID setId, java.util.UUID transcriptId,
                                                   java.util.UUID sessionId, int attemptNumber) {}
    public record QuestionGeneratedEvent(java.util.UUID questionId, String questionText,
                                          String questionType, String options, String correctAnswer,
                                          java.util.UUID lectureId, java.util.UUID sectionId,
                                          java.util.UUID subsectionId, java.util.UUID topicId,
                                          java.util.UUID conceptId, String learningObjective,
                                          String difficulty, Integer questionSequence,
                                          java.time.Instant generatedAt, String generationModel,
                                          String generationVersion) {}
}
