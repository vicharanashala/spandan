package com.spandan.questiongen.infrastructure.persistence;

import com.spandan.questiongen.domain.entity.GeneratedQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GeneratedQuestionRepository extends JpaRepository<GeneratedQuestion, UUID> {

    List<GeneratedQuestion> findByQuestionSetId(UUID questionSetId);

    long countByQuestionSetId(UUID questionSetId);
}
