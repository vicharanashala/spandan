package com.spandan.gateway.presentation.dto;

public class QuestionDisplayAck {

    private String questionId;
    private String clientDisplayedAt;

    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getClientDisplayedAt() { return clientDisplayedAt; }
    public void setClientDisplayedAt(String clientDisplayedAt) { this.clientDisplayedAt = clientDisplayedAt; }
}
