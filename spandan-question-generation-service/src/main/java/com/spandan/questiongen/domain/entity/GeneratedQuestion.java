package com.spandan.questiongen.domain.entity;

import com.spandan.questiongen.domain.enums.QuestionType;
import com.spandan.questiongen.domain.enums.ReviewStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "generated_questions")
public class GeneratedQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_set_id", nullable = false, foreignKey = @ForeignKey(name = "fk_gq_question_set"))
    private QuestionSet questionSet;

    @Enumerated(EnumType.STRING)
    @Column(name = "question_type", nullable = false)
    private QuestionType questionType;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(name = "options", columnDefinition = "JSONB")
    private String options;

    @Column(name = "correct_answer", nullable = false, columnDefinition = "TEXT")
    private String correctAnswer;

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

    @Column(name = "difficulty", length = 10)
    private String difficulty = "MEDIUM";

    @Column(name = "question_sequence")
    private Integer questionSequence;

    @Column(name = "generated_at")
    private Instant generatedAt;

    @Column(name = "generation_model", length = 50)
    private String generationModel;

    @Column(name = "generation_version", length = 50)
    private String generationVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false)
    private ReviewStatus reviewStatus = ReviewStatus.PENDING_REVIEW;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public QuestionSet getQuestionSet() { return questionSet; }
    public void setQuestionSet(QuestionSet questionSet) { this.questionSet = questionSet; }
    public QuestionType getQuestionType() { return questionType; }
    public void setQuestionType(QuestionType questionType) { this.questionType = questionType; }
    public String getQuestionText() { return questionText; }
    public void setQuestionText(String questionText) { this.questionText = questionText; }
    public String getOptions() { return options; }
    public void setOptions(String options) { this.options = options; }
    public String getCorrectAnswer() { return correctAnswer; }
    public void setCorrectAnswer(String correctAnswer) { this.correctAnswer = correctAnswer; }
    public UUID getLectureId() { return lectureId; }
    public void setLectureId(UUID lectureId) { this.lectureId = lectureId; }
    public UUID getSectionId() { return sectionId; }
    public void setSectionId(UUID sectionId) { this.sectionId = sectionId; }
    public UUID getSubsectionId() { return subsectionId; }
    public void setSubsectionId(UUID subsectionId) { this.subsectionId = subsectionId; }
    public UUID getTopicId() { return topicId; }
    public void setTopicId(UUID topicId) { this.topicId = topicId; }
    public UUID getConceptId() { return conceptId; }
    public void setConceptId(UUID conceptId) { this.conceptId = conceptId; }
    public String getLearningObjective() { return learningObjective; }
    public void setLearningObjective(String learningObjective) { this.learningObjective = learningObjective; }
    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }
    public Integer getQuestionSequence() { return questionSequence; }
    public void setQuestionSequence(Integer questionSequence) { this.questionSequence = questionSequence; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
    public String getGenerationModel() { return generationModel; }
    public void setGenerationModel(String generationModel) { this.generationModel = generationModel; }
    public String getGenerationVersion() { return generationVersion; }
    public void setGenerationVersion(String generationVersion) { this.generationVersion = generationVersion; }
    public ReviewStatus getReviewStatus() { return reviewStatus; }
    public void setReviewStatus(ReviewStatus reviewStatus) { this.reviewStatus = reviewStatus; }
}
