package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.LearningObjectiveMastery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LearningObjectiveMasteryRepository extends JpaRepository<LearningObjectiveMastery, UUID> {

    List<LearningObjectiveMastery> findBySessionId(UUID sessionId);

    List<LearningObjectiveMastery> findBySessionIdAndStudentId(UUID sessionId, UUID studentId);

    List<LearningObjectiveMastery> findBySessionIdAndLearningObjective(UUID sessionId, String learningObjective);
}
