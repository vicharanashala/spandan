package com.spandan.response.infrastructure.persistence;

import com.spandan.response.domain.entity.RawEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface RawEventRepository extends JpaRepository<RawEvent, UUID> {
    Optional<RawEvent> findByEventId(UUID eventId);
}
