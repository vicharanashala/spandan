package com.spandan.questiongen.presentation.dto;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.enums.ReviewStatus;

import java.util.UUID;

public record GeneratedQuestionResponse(
    UUID id,
    QuestionType questionType,
    String questionText,
    String options,
    String correctAnswer,
    ReviewStatus reviewStatus
) {
    public static GeneratedQuestionResponse from(GeneratedQuestion entity) {
        return new GeneratedQuestionResponse(
            entity.getId(),
            entity.getQuestionType(),
            entity.getQuestionText(),
            entity.getOptions(),
            entity.getCorrectAnswer(),
            entity.getReviewStatus()
        );
    }
}
