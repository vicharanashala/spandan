package com.spandan.questiongen.presentation.dto;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.enums.ReviewStatus;

import java.time.Instant;
import java.util.UUID;

public record GeneratedQuestionResponse(
    UUID id,
    QuestionType questionType,
    String questionText,
    String options,
    String correctAnswer,
    UUID lectureId,
    UUID sectionId,
    UUID subsectionId,
    UUID topicId,
    UUID conceptId,
    String learningObjective,
    String difficulty,
    Integer questionSequence,
    Instant generatedAt,
    String generationModel,
    String generationVersion,
    ReviewStatus reviewStatus
) {
    public static GeneratedQuestionResponse from(GeneratedQuestion entity) {
        return new GeneratedQuestionResponse(
            entity.getId(),
            entity.getQuestionType(),
            entity.getQuestionText(),
            entity.getOptions(),
            entity.getCorrectAnswer(),
            entity.getLectureId(),
            entity.getSectionId(),
            entity.getSubsectionId(),
            entity.getTopicId(),
            entity.getConceptId(),
            entity.getLearningObjective(),
            entity.getDifficulty(),
            entity.getQuestionSequence(),
            entity.getGeneratedAt(),
            entity.getGenerationModel(),
            entity.getGenerationVersion(),
            entity.getReviewStatus()
        );
    }
}
