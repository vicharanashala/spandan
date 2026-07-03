package com.spandan.review.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class RejectRequest {
    @NotNull
    private Integer version;
    @NotBlank
    private String comments;

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getComments() { return comments; }
    public void setComments(String comments) { this.comments = comments; }
}
