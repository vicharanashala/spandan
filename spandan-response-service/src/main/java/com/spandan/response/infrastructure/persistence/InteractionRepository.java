package com.spandan.response.infrastructure.persistence;

import com.spandan.response.domain.entity.Interaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface InteractionRepository extends JpaRepository<Interaction, UUID> {
    Optional<Interaction> findByEventId(UUID eventId);
    List<Interaction> findBySessionId(UUID sessionId);
    Page<Interaction> findBySessionId(UUID sessionId, Pageable pageable);
    List<Interaction> findBySessionIdAndStudentId(UUID sessionId, UUID studentId);
    List<Interaction> findByQuestionId(UUID questionId);
    Optional<Interaction> findBySessionIdAndQuestionIdAndStudentId(UUID sessionId, UUID questionId, UUID studentId);
    List<Interaction> findBySessionIdAndLectureId(UUID sessionId, UUID lectureId);
    List<Interaction> findBySessionIdAndTimeoutTrue(UUID sessionId);
    long countBySessionId(UUID sessionId);
    long countBySessionIdAndAnsweredTrue(UUID sessionId);
    long countBySessionIdAndTimeoutTrue(UUID sessionId);
}
