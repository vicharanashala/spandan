package com.spandan.polling.application.mapper;

import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.presentation.dto.response.CurrentPollResponse;
import com.spandan.polling.presentation.dto.response.QuizDetailResponse;
import com.spandan.polling.presentation.dto.response.QuizResponse;

import java.util.List;

public class QuizMapper {

    public static QuizResponse toResponse(Quiz quiz) {
        return new QuizResponse(
                quiz.getId(),
                quiz.getAdminId(),
                quiz.getTeacherId(),
                quiz.getQuizStatus().name(),
                quiz.getCurrentQuestionNumber(),
                quiz.getTotalQuestions(),
                quiz.getLectureId(),
                quiz.getSectionId(),
                quiz.getSubsectionId(),
                quiz.getCreatedAt()
        );
    }

    public static QuizDetailResponse toDetailResponse(Quiz quiz, List<QuizQuestion> questions) {
        List<QuizDetailResponse.QuestionSummary> questionSummaries = questions.stream()
                .map(q -> new QuizDetailResponse.QuestionSummary(
                        q.getId(),
                        q.getSequencePosition(),
                        q.getQuestionStatus().name(),
                        q.getTimerDurationSeconds(),
                        q.getLectureId(),
                        q.getSectionId(),
                        q.getSubsectionId(),
                        q.getTopicId(),
                        q.getConceptId(),
                        q.getLearningObjectiveId(),
                        q.getDifficulty(),
                        q.getQuestionType(),
                        q.getCorrectAnswer()
                )).toList();

        return new QuizDetailResponse(
                quiz.getId(),
                quiz.getAdminId(),
                quiz.getTeacherId(),
                quiz.getQuizStatus().name(),
                quiz.getCurrentQuestionNumber(),
                quiz.getTotalQuestions(),
                quiz.getLectureId(),
                quiz.getSectionId(),
                quiz.getSubsectionId(),
                quiz.getStartedAt(),
                quiz.getEndedAt(),
                questionSummaries,
                quiz.getCreatedAt()
        );
    }

    public static CurrentPollResponse toCurrentPollResponse(Quiz quiz, QuizQuestion question, int remainingSeconds) {
        return new CurrentPollResponse(
                quiz.getId(),
                quiz.getCurrentQuestionNumber(),
                question.getId(),
                question.getQuestionStatus().name(),
                remainingSeconds,
                quiz.getQuizStatus().name()
        );
    }
}
