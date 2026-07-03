package com.spandan.review.infrastructure.persistence;

import com.spandan.review.domain.entity.Review;
import com.spandan.review.domain.enums.ReviewStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReviewRepository extends JpaRepository<Review, UUID> {

    List<Review> findByQuestionSetIdOrderByQuestionOrderAsc(UUID questionSetId);

    List<Review> findByTeacherIdAndReviewStatusOrderByCreatedAtDesc(UUID teacherId, ReviewStatus status);

    Optional<Review> findByQuestionSetIdAndQuestionId(UUID questionSetId, UUID questionId);

    long countByQuestionSetId(UUID questionSetId);

    long countByQuestionSetIdAndReviewStatus(UUID questionSetId, ReviewStatus status);

    List<Review> findByQuestionSetIdAndReviewStatus(UUID questionSetId, ReviewStatus status);

    @Query("SELECT DISTINCT r.questionSetId FROM Review r WHERE r.teacherId = :teacherId AND r.reviewStatus = :status")
    List<UUID> findDistinctQuestionSetIdsByTeacherIdAndReviewStatus(@Param("teacherId") UUID teacherId,
                                                                      @Param("status") ReviewStatus status);
}
