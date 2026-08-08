package com.spandan.response.infrastructure.persistence;

import com.spandan.response.domain.entity.QuestionMetadata;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface QuestionMetadataRepository extends JpaRepository<QuestionMetadata, UUID> {
    Optional<QuestionMetadata> findByQuestionId(UUID questionId);
}
