package com.spandan.review.infrastructure.persistence;

import com.spandan.review.domain.entity.QuestionVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface QuestionVersionRepository extends JpaRepository<QuestionVersion, UUID> {

    List<QuestionVersion> findByReviewIdOrderByVersionNumberAsc(UUID reviewId);

    int countByReviewId(UUID reviewId);
}
