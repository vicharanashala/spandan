package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.LeaderboardEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeaderboardEntryJpaRepository extends JpaRepository<LeaderboardEntry, UUID> {
    List<LeaderboardEntry> findByQuizIdOrderByRankAsc(UUID quizId);
    Optional<LeaderboardEntry> findByQuizIdAndStudentId(UUID quizId, UUID studentId);
    void deleteByQuizId(UUID quizId);
}
