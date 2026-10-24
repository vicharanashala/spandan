package com.spandan.gateway.domain.entity;

import com.spandan.gateway.domain.enums.UserRole;

import java.time.Instant;

public class ConnectionSession {

    private String sessionId;
    private String userId;
    private UserRole role;
    private String quizId;
    private String podId;
    private Instant connectedAt;
    private Instant lastHeartbeatAt;

    public ConnectionSession() {}

    public ConnectionSession(String sessionId, String userId, UserRole role, String quizId, String podId) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.role = role;
        this.quizId = quizId;
        this.podId = podId;
        this.connectedAt = Instant.now();
        this.lastHeartbeatAt = Instant.now();
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public UserRole getRole() { return role; }
    public void setRole(UserRole role) { this.role = role; }
    public String getQuizId() { return quizId; }
    public void setQuizId(String quizId) { this.quizId = quizId; }
    public String getPodId() { return podId; }
    public void setPodId(String podId) { this.podId = podId; }
    public Instant getConnectedAt() { return connectedAt; }
    public void setConnectedAt(Instant connectedAt) { this.connectedAt = connectedAt; }
    public Instant getLastHeartbeatAt() { return lastHeartbeatAt; }
    public void setLastHeartbeatAt(Instant lastHeartbeatAt) { this.lastHeartbeatAt = lastHeartbeatAt; }

    public void refreshHeartbeat() {
        this.lastHeartbeatAt = Instant.now();
    }
}
