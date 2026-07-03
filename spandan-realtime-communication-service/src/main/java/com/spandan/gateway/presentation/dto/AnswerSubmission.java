package com.spandan.gateway.presentation.dto;

public class AnswerSubmission {

    private String quizId;
    private String questionId;
    private String answer;
    private String idempotencyKey;

    public String getQuizId() { return quizId; }
    public void setQuizId(String quizId) { this.quizId = quizId; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
}
