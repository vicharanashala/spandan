package com.spandan.review.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class EditRequest {
    @NotNull
    private Integer version;
    @NotBlank
    private String questionText;
    private String options;
    @NotBlank
    private String correctAnswer;

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getQuestionText() { return questionText; }
    public void setQuestionText(String questionText) { this.questionText = questionText; }
    public String getOptions() { return options; }
    public void setOptions(String options) { this.options = options; }
    public String getCorrectAnswer() { return correctAnswer; }
    public void setCorrectAnswer(String correctAnswer) { this.correctAnswer = correctAnswer; }
}
