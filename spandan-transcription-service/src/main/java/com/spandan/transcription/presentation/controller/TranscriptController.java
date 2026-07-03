package com.spandan.transcription.presentation.controller;

import com.spandan.transcription.domain.entity.Transcript;
import com.spandan.transcription.domain.exception.TranscriptionException;
import com.spandan.transcription.infrastructure.persistence.TranscriptJpaRepository;
import com.spandan.transcription.presentation.dto.TranscriptResponse;
import com.spandan.transcription.presentation.dto.TranscriptStatusResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transcripts")
public class TranscriptController {

    private final TranscriptJpaRepository transcriptRepo;

    public TranscriptController(TranscriptJpaRepository transcriptRepo) {
        this.transcriptRepo = transcriptRepo;
    }

    @GetMapping("/session/{sessionId}")
    public ResponseEntity<TranscriptResponse> getTranscript(@PathVariable UUID sessionId) {
        Transcript t = transcriptRepo.findBySessionId(sessionId)
                .orElseThrow(() -> TranscriptionException.notFound("No transcript found for session " + sessionId));

        if (t.getExpiryAt() != null && t.getExpiryAt().isBefore(Instant.now())) {
            return ResponseEntity.status(HttpStatus.GONE).build();
        }

        return ResponseEntity.ok(toResponse(t));
    }

    @GetMapping("/session/{sessionId}/status")
    public ResponseEntity<TranscriptStatusResponse> getStatus(@PathVariable UUID sessionId) {
        Transcript t = transcriptRepo.findBySessionId(sessionId)
                .orElseThrow(() -> TranscriptionException.notFound("No transcript found for session " + sessionId));
        TranscriptStatusResponse resp = new TranscriptStatusResponse();
        resp.setProcessingStatus(t.getProcessingStatus());
        resp.setTotalSegments(t.getTotalSegments());
        resp.setTotalDurationMs(t.getTotalDurationMs());
        resp.setFailureReason(t.getFailureReason());
        return ResponseEntity.ok(resp);
    }

    @DeleteMapping("/{transcriptId}")
    public ResponseEntity<Void> deleteTranscript(@PathVariable UUID transcriptId) {
        if (!transcriptRepo.existsById(transcriptId)) {
            throw TranscriptionException.notFound("No transcript found with id " + transcriptId);
        }
        transcriptRepo.deleteById(transcriptId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("UP");
    }

    private TranscriptResponse toResponse(Transcript t) {
        TranscriptResponse r = new TranscriptResponse();
        r.setId(t.getId());
        r.setSessionId(t.getSessionId());
        r.setStreamId(t.getStreamId());
        r.setTranscriptText(t.getTranscriptText());
        r.setProcessingStatus(t.getProcessingStatus());
        r.setTotalSegments(t.getTotalSegments());
        r.setTotalDurationMs(t.getTotalDurationMs());
        r.setFailureReason(t.getFailureReason());
        r.setCreatedAt(t.getCreatedAt());
        r.setExpiryAt(t.getExpiryAt());
        return r;
    }
}
