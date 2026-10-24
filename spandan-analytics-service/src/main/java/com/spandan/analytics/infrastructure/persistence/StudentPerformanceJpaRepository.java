package com.spandan.analytics.infrastructure.persistence;

import com.spandan.analytics.domain.entity.StudentPerformance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StudentPerformanceJpaRepository extends JpaRepository<StudentPerformance, UUID> {
    List<StudentPerformance> findByQuizId(UUID quizId);
    Optional<StudentPerformance> findByQuizIdAndStudentId(UUID quizId, UUID studentId);
}
