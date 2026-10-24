package com.spandan.analytics.presentation.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class ConceptHistoryResponse {
    private String conceptId;
    private String conceptName;
    private int totalAttempts;
    private int totalCorrect;
    private BigDecimal masteryPct;
    private int sessionsCovered;
    private BigDecimal lastAccuracy;

    public String getConceptId() { return conceptId; }
    public void setConceptId(String v) { this.conceptId = v; }
    public String getConceptName() { return conceptName; }
    public void setConceptName(String v) { this.conceptName = v; }
    public int getTotalAttempts() { return totalAttempts; }
    public void setTotalAttempts(int v) { this.totalAttempts = v; }
    public int getTotalCorrect() { return totalCorrect; }
    public void setTotalCorrect(int v) { this.totalCorrect = v; }
    public BigDecimal getMasteryPct() { return masteryPct; }
    public void setMasteryPct(BigDecimal v) { this.masteryPct = v; }
    public int getSessionsCovered() { return sessionsCovered; }
    public void setSessionsCovered(int v) { this.sessionsCovered = v; }
    public BigDecimal getLastAccuracy() { return lastAccuracy; }
    public void setLastAccuracy(BigDecimal v) { this.lastAccuracy = v; }
}
