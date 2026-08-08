package com.spandan.transcription.domain.port;

import com.spandan.transcription.domain.entity.TranscriptionAudit;

public interface TranscriptionAuditRepository {
    void save(TranscriptionAudit audit);
}
