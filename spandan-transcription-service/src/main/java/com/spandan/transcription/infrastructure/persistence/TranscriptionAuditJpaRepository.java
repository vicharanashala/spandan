package com.spandan.transcription.infrastructure.persistence;

import com.spandan.transcription.domain.entity.TranscriptionAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TranscriptionAuditJpaRepository extends JpaRepository<TranscriptionAudit, UUID> {
}
