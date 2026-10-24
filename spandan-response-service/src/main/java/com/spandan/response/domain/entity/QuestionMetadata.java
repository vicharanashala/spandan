package com.spandan.response.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "question_metadata")
public class QuestionMetadata {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "question_id", nullable = false, unique = true)
    private UUID questionId;

    @Column(name = "correct_answer", length = 500)
    private String correctAnswer;

    @Column(name = "question_type", length = 20)
    private String questionType;

    @Column(name = "difficulty", length = 10)
    private String difficulty;

    @Column(name = "lecture_id")
    private UUID lectureId;

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

    @Column(name = "question_sequence")
    private Integer questionSequence;

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

    public UUID getQuestionId() {
        return questionId;
    }

    public void setQuestionId(UUID questionId) {
        this.questionId = questionId;
    }

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
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

    public UUID getLectureId() {
        return lectureId;
    }

    public void setLectureId(UUID lectureId) {
        this.lectureId = lectureId;
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

    public Integer getQuestionSequence() {
        return questionSequence;
    }

    public void setQuestionSequence(Integer questionSequence) {
        this.questionSequence = questionSequence;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
