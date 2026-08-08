package com.spandan.questiongen.infrastructure.persistence;

import com.spandan.questiongen.domain.entity.QuestionSet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface QuestionSetRepository extends JpaRepository<QuestionSet, UUID> {

    Optional<QuestionSet> findTopByTranscriptIdOrderByAttemptNumberDesc(UUID transcriptId);

    List<QuestionSet> findBySessionId(UUID sessionId);

    @Query("SELECT qs FROM QuestionSet qs WHERE qs.expiryAt IS NOT NULL AND qs.expiryAt <= :now AND qs.savedFlag = false")
    List<QuestionSet> findExpiredUnsavedSets(@Param("now") Instant now);

    boolean existsByTranscriptIdAndAttemptNumber(UUID transcriptId, int attemptNumber);
}
