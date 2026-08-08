package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class QuestionAnalyticsResponse {
    private UUID questionId;
    private int responsesReceived;
    private int correctCount;
    private int incorrectCount;
    private int skippedCount;
    private BigDecimal accuracyPct;
    private BigDecimal averageResponseTimeSeconds;
    private BigDecimal difficultyScore;

    public UUID getQuestionId() { return questionId; }
    public void setQuestionId(UUID questionId) { this.questionId = questionId; }
    public int getResponsesReceived() { return responsesReceived; }
    public void setResponsesReceived(int responsesReceived) { this.responsesReceived = responsesReceived; }
    public int getCorrectCount() { return correctCount; }
    public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
    public int getIncorrectCount() { return incorrectCount; }
    public void setIncorrectCount(int incorrectCount) { this.incorrectCount = incorrectCount; }
    public int getSkippedCount() { return skippedCount; }
    public void setSkippedCount(int skippedCount) { this.skippedCount = skippedCount; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
    public void setAccuracyPct(BigDecimal accuracyPct) { this.accuracyPct = accuracyPct; }
    public BigDecimal getAverageResponseTimeSeconds() { return averageResponseTimeSeconds; }
    public void setAverageResponseTimeSeconds(BigDecimal averageResponseTimeSeconds) { this.averageResponseTimeSeconds = averageResponseTimeSeconds; }
    public BigDecimal getDifficultyScore() { return difficultyScore; }
    public void setDifficultyScore(BigDecimal difficultyScore) { this.difficultyScore = difficultyScore; }
}
