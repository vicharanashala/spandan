package com.spandan.gateway.domain.entity;

import java.time.Instant;
import java.util.Objects;

public class QuestionDeliveryState {

    private String studentId;
    private String questionId;
    private Instant questionDisplayedAt;
    private Instant answeredAt;
    private boolean timedOut;
    private String selectedAnswer;

    public QuestionDeliveryState() {
        this.timedOut = false;
    }

    public QuestionDeliveryState(String studentId, String questionId) {
        this.studentId = studentId;
        this.questionId = questionId;
        this.timedOut = false;
    }

    public QuestionDeliveryState(String studentId, String questionId, Instant questionDisplayedAt) {
        this.studentId = studentId;
        this.questionId = questionId;
        this.questionDisplayedAt = questionDisplayedAt;
        this.timedOut = false;
    }

    public QuestionDeliveryState(String studentId, String questionId, Instant questionDisplayedAt,
                                 Instant answeredAt, boolean timedOut, String selectedAnswer) {
        this.studentId = studentId;
        this.questionId = questionId;
        this.questionDisplayedAt = questionDisplayedAt;
        this.answeredAt = answeredAt;
        this.timedOut = timedOut;
        this.selectedAnswer = selectedAnswer;
    }

    public String getStudentId() {
        return studentId;
    }

    public void setStudentId(String studentId) {
        this.studentId = studentId;
    }

    public String getQuestionId() {
        return questionId;
    }

    public void setQuestionId(String questionId) {
        this.questionId = questionId;
    }

    public Instant getQuestionDisplayedAt() {
        return questionDisplayedAt;
    }

    public void setQuestionDisplayedAt(Instant questionDisplayedAt) {
        this.questionDisplayedAt = questionDisplayedAt;
    }

    public Instant getAnsweredAt() {
        return answeredAt;
    }

    public void setAnsweredAt(Instant answeredAt) {
        this.answeredAt = answeredAt;
    }

    public boolean isTimedOut() {
        return timedOut;
    }

    public void setTimedOut(boolean timedOut) {
        this.timedOut = timedOut;
    }

    public String getSelectedAnswer() {
        return selectedAnswer;
    }

    public void setSelectedAnswer(String selectedAnswer) {
        this.selectedAnswer = selectedAnswer;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        QuestionDeliveryState that = (QuestionDeliveryState) o;
        return timedOut == that.timedOut
                && Objects.equals(studentId, that.studentId)
                && Objects.equals(questionId, that.questionId)
                && Objects.equals(questionDisplayedAt, that.questionDisplayedAt)
                && Objects.equals(answeredAt, that.answeredAt)
                && Objects.equals(selectedAnswer, that.selectedAnswer);
    }

    @Override
    public int hashCode() {
        return Objects.hash(studentId, questionId, questionDisplayedAt, answeredAt, timedOut, selectedAnswer);
    }

    @Override
    public String toString() {
        return "QuestionDeliveryState{" +
                "studentId='" + studentId + '\'' +
                ", questionId='" + questionId + '\'' +
                ", questionDisplayedAt=" + questionDisplayedAt +
                ", answeredAt=" + answeredAt +
                ", timedOut=" + timedOut +
                ", selectedAnswer='" + selectedAnswer + '\'' +
                '}';
    }
}
