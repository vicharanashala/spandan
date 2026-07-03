package com.spandan.review.presentation.dto;

import jakarta.validation.constraints.NotNull;

public class ApproveRequest {
    @NotNull
    private Integer version;
    private String comments;

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getComments() { return comments; }
    public void setComments(String comments) { this.comments = comments; }
}
