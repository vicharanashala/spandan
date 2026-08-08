package com.spandan.gateway.presentation.dto;

public class ActivityAck {

    private String quizId;
    private boolean active;

    public String getQuizId() { return quizId; }
    public void setQuizId(String quizId) { this.quizId = quizId; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
