package com.spandan.analytics.domain.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "leaderboard_entries",
       uniqueConstraints = {
           @UniqueConstraint(columnNames = {"quiz_id", "student_id"}),
           @UniqueConstraint(columnNames = {"quiz_id", "rank"})
       })
public class LeaderboardEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "quiz_id", nullable = false)
    private UUID quizId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "rank", nullable = false)
    private int rank;

    @Column(name = "total_score", nullable = false, precision = 8, scale = 2)
    private BigDecimal totalScore;

    @Column(name = "accuracy_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal accuracyPct;

    public LeaderboardEntry() {}

    public LeaderboardEntry(UUID quizId, UUID studentId, int rank,
                            BigDecimal totalScore, BigDecimal accuracyPct) {
        this.quizId = quizId;
        this.studentId = studentId;
        this.rank = rank;
        this.totalScore = totalScore;
        this.accuracyPct = accuracyPct;
    }

    public UUID getId() { return id; }
    public UUID getQuizId() { return quizId; }
    public UUID getStudentId() { return studentId; }
    public int getRank() { return rank; }
    public BigDecimal getTotalScore() { return totalScore; }
    public BigDecimal getAccuracyPct() { return accuracyPct; }
}
