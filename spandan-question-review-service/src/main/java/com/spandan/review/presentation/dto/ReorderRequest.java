package com.spandan.review.presentation.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public class ReorderRequest {
    @NotEmpty
    private List<UUID> orderedReviewIds;

    public List<UUID> getOrderedReviewIds() { return orderedReviewIds; }
    public void setOrderedReviewIds(List<UUID> orderedReviewIds) { this.orderedReviewIds = orderedReviewIds; }
}
