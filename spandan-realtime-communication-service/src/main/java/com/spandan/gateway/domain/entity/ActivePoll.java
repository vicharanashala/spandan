package com.spandan.gateway.domain.entity;

import java.time.Instant;

public class ActivePoll {

    private String sessionId;
    private String questionId;
    private String lectureId;
    private String sectionId;
    private String subsectionId;
    private String topicId;
    private String conceptId;
    private Integer questionSequence;
    private long pollDurationMs;
    private String adminId;
    private Instant pollOpenedAt;
    private Instant createdAt;

    public ActivePoll() {}

    public String getAdminId() { return adminId; }
    public void setAdminId(String adminId) { this.adminId = adminId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getLectureId() { return lectureId; }
    public void setLectureId(String lectureId) { this.lectureId = lectureId; }
    public String getSectionId() { return sectionId; }
    public void setSectionId(String sectionId) { this.sectionId = sectionId; }
    public String getSubsectionId() { return subsectionId; }
    public void setSubsectionId(String subsectionId) { this.subsectionId = subsectionId; }
    public String getTopicId() { return topicId; }
    public void setTopicId(String topicId) { this.topicId = topicId; }
    public String getConceptId() { return conceptId; }
    public void setConceptId(String conceptId) { this.conceptId = conceptId; }
    public Integer getQuestionSequence() { return questionSequence; }
    public void setQuestionSequence(Integer questionSequence) { this.questionSequence = questionSequence; }
    public long getPollDurationMs() { return pollDurationMs; }
    public void setPollDurationMs(long pollDurationMs) { this.pollDurationMs = pollDurationMs; }
    public Instant getPollOpenedAt() { return pollOpenedAt; }
    public void setPollOpenedAt(Instant pollOpenedAt) { this.pollOpenedAt = pollOpenedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
