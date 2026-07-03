package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class LeaderboardEntryResponse {
    private int rank;
    private UUID studentId;
    private BigDecimal totalScore;
    private BigDecimal accuracyPct;

    public int getRank() { return rank; }
    public void setRank(int rank) { this.rank = rank; }
    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public BigDecimal getTotalScore() { return totalScore; }
    public void setTotalScore(BigDecimal totalScore) { this.totalScore = totalScore; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
    public void setAccuracyPct(BigDecimal accuracyPct) { this.accuracyPct = accuracyPct; }
}
