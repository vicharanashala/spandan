package com.spandan.questiongen.domain.entity;

import com.spandan.questiongen.domain.enums.GenerationStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "question_sets",
       uniqueConstraints = @UniqueConstraint(columnNames = {"transcript_id", "attempt_number"}))
public class QuestionSet {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "transcript_id", nullable = false)
    private UUID transcriptId;

    @Column(name = "teacher_id", nullable = false)
    private UUID teacherId;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Column(name = "ai_provider")
    private String aiProvider;

    @Column(name = "prompt_version")
    private String promptVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "generation_status", nullable = false)
    private GenerationStatus generationStatus = GenerationStatus.PENDING;

    @Column(name = "saved_flag", nullable = false)
    private boolean savedFlag = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expiry_at")
    private Instant expiryAt;

    @OneToMany(mappedBy = "questionSet", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<GeneratedQuestion> questions = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getTranscriptId() { return transcriptId; }
    public void setTranscriptId(UUID transcriptId) { this.transcriptId = transcriptId; }
    public UUID getTeacherId() { return teacherId; }
    public void setTeacherId(UUID teacherId) { this.teacherId = teacherId; }
    public int getAttemptNumber() { return attemptNumber; }
    public void setAttemptNumber(int attemptNumber) { this.attemptNumber = attemptNumber; }
    public String getAiProvider() { return aiProvider; }
    public void setAiProvider(String aiProvider) { this.aiProvider = aiProvider; }
    public String getPromptVersion() { return promptVersion; }
    public void setPromptVersion(String promptVersion) { this.promptVersion = promptVersion; }
    public GenerationStatus getGenerationStatus() { return generationStatus; }
    public void setGenerationStatus(GenerationStatus generationStatus) { this.generationStatus = generationStatus; }
    public boolean isSavedFlag() { return savedFlag; }
    public void setSavedFlag(boolean savedFlag) { this.savedFlag = savedFlag; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiryAt() { return expiryAt; }
    public void setExpiryAt(Instant expiryAt) { this.expiryAt = expiryAt; }
    public List<GeneratedQuestion> getQuestions() { return questions; }
    public void setQuestions(List<GeneratedQuestion> questions) { this.questions = questions; }
}
