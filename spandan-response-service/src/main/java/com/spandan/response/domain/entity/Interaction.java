package com.spandan.response.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "interactions", uniqueConstraints = @UniqueConstraint(columnNames = {"student_id", "question_id"}))
public class Interaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "event_id", nullable = false, unique = true)
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 20)
    private String eventType;

    @Column(name = "event_timestamp", nullable = false)
    private Instant eventTimestamp;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "lecture_id")
    private UUID lectureId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "section_id")
    private UUID sectionId;

    @Column(name = "subsection_id")
    private UUID subsectionId;

    @Column(name = "topic_id")
    private UUID topicId;

    @Column(name = "concept_id")
    private UUID conceptId;

    @Column(name = "learning_objective", length = 500)
    private String learningObjective;

    @Column(name = "question_type", length = 20)
    private String questionType;

    @Column(name = "difficulty", length = 10)
    private String difficulty;

    @Column(name = "question_sequence")
    private Integer questionSequence;

    @Column(name = "question_displayed_at")
    private Instant questionDisplayedAt;

    @Column(name = "question_answered_at")
    private Instant questionAnsweredAt;

    @Column(name = "response_time_ms")
    private Long responseTimeMs;

    @Column(name = "selected_answer", length = 500)
    private String selectedAnswer;

    @Column(name = "correct_answer", length = 500)
    private String correctAnswer;

    @Column(name = "is_correct")
    private Boolean isCorrect;

    @Column(name = "answered", nullable = false)
    private Boolean answered = false;

    @Column(name = "timeout", nullable = false)
    private Boolean timeout = false;

    @Column(name = "event_version", length = 10)
    private String eventVersion = "1.0";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getEventId() {
        return eventId;
    }

    public void setEventId(UUID eventId) {
        this.eventId = eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public Instant getEventTimestamp() {
        return eventTimestamp;
    }

    public void setEventTimestamp(Instant eventTimestamp) {
        this.eventTimestamp = eventTimestamp;
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public void setSessionId(UUID sessionId) {
        this.sessionId = sessionId;
    }

    public UUID getLectureId() {
        return lectureId;
    }

    public void setLectureId(UUID lectureId) {
        this.lectureId = lectureId;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public void setStudentId(UUID studentId) {
        this.studentId = studentId;
    }

    public UUID getQuestionId() {
        return questionId;
    }

    public void setQuestionId(UUID questionId) {
        this.questionId = questionId;
    }

    public UUID getSectionId() {
        return sectionId;
    }

    public void setSectionId(UUID sectionId) {
        this.sectionId = sectionId;
    }

    public UUID getSubsectionId() {
        return subsectionId;
    }

    public void setSubsectionId(UUID subsectionId) {
        this.subsectionId = subsectionId;
    }

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
    }

    public UUID getConceptId() {
        return conceptId;
    }

    public void setConceptId(UUID conceptId) {
        this.conceptId = conceptId;
    }

    public String getLearningObjective() {
        return learningObjective;
    }

    public void setLearningObjective(String learningObjective) {
        this.learningObjective = learningObjective;
    }

    public String getQuestionType() {
        return questionType;
    }

    public void setQuestionType(String questionType) {
        this.questionType = questionType;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public Integer getQuestionSequence() {
        return questionSequence;
    }

    public void setQuestionSequence(Integer questionSequence) {
        this.questionSequence = questionSequence;
    }

    public Instant getQuestionDisplayedAt() {
        return questionDisplayedAt;
    }

    public void setQuestionDisplayedAt(Instant questionDisplayedAt) {
        this.questionDisplayedAt = questionDisplayedAt;
    }

    public Instant getQuestionAnsweredAt() {
        return questionAnsweredAt;
    }

    public void setQuestionAnsweredAt(Instant questionAnsweredAt) {
        this.questionAnsweredAt = questionAnsweredAt;
    }

    public Long getResponseTimeMs() {
        return responseTimeMs;
    }

    public void setResponseTimeMs(Long responseTimeMs) {
        this.responseTimeMs = responseTimeMs;
    }

    public String getSelectedAnswer() {
        return selectedAnswer;
    }

    public void setSelectedAnswer(String selectedAnswer) {
        this.selectedAnswer = selectedAnswer;
    }

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public Boolean getIsCorrect() {
        return isCorrect;
    }

    public void setIsCorrect(Boolean isCorrect) {
        this.isCorrect = isCorrect;
    }

    public Boolean getAnswered() {
        return answered;
    }

    public void setAnswered(Boolean answered) {
        this.answered = answered;
    }

    public Boolean getTimeout() {
        return timeout;
    }

    public void setTimeout(Boolean timeout) {
        this.timeout = timeout;
    }

    public String getEventVersion() {
        return eventVersion;
    }

    public void setEventVersion(String eventVersion) {
        this.eventVersion = eventVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
