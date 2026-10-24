package com.spandan.recording.presentation.controller;

import com.spandan.recording.application.service.StreamOrchestrator;
import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.AudioFormat;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.enums.StreamStatus;
import com.spandan.recording.domain.port.StreamSessionRepository;
import com.spandan.recording.presentation.dto.*;
import com.spandan.recording.presentation.websocket.AudioStreamWebSocketHandler;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/streams")
public class StreamController {

    private final StreamOrchestrator orchestrator;
    private final StreamSessionRepository sessionRepository;
    private final AudioStreamWebSocketHandler webSocketHandler;

    public StreamController(StreamOrchestrator orchestrator,
                            StreamSessionRepository sessionRepository,
                            AudioStreamWebSocketHandler webSocketHandler) {
        this.orchestrator = orchestrator;
        this.sessionRepository = sessionRepository;
        this.webSocketHandler = webSocketHandler;
    }

    @PostMapping("/start")
    @PreAuthorize("hasAnyRole('TEACHER', 'ADMIN')")
    public ResponseEntity<StartStreamResponse> startStream(@Valid @RequestBody StartStreamRequest request) {
        StreamSession session = orchestrator.startStream(
                request.getTeacherId(),
                request.getLectureId(),
                request.getSessionId(),
                AudioFormat.valueOf(request.getAudioFormat()),
                StreamProvider.valueOf(request.getProvider())
        );

        webSocketHandler.initStreamingSession(session, request.getProviderEndpoint());

        var response = new StartStreamResponse(
                session.getId(),
                session.getSessionId(),
                session.getStatus().name(),
                session.getProvider().name(),
                session.getStartedAt()
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/{sessionId}/stop")
    @PreAuthorize("hasAnyRole('TEACHER', 'ADMIN')")
    public ResponseEntity<StopStreamResponse> stopStream(@PathVariable UUID sessionId) {
        var activeOpt = orchestrator.getActiveStream(sessionId);
        if (activeOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        StreamSession session = activeOpt.get().getSession();
        orchestrator.stopStream(sessionId);

        var response = new StopStreamResponse(
                session.getSessionId(),
                session.getStatus().name(),
                session.getDurationMs() != null ? session.getDurationMs() : 0L,
                session.getChunksSent(),
                session.getChunksDropped(),
                session.getStoppedAt()
        );

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<StreamStatusResponse> getStreamStatus(@PathVariable UUID sessionId) {
        var sessionOpt = sessionRepository.findBySessionId(sessionId);
        if (sessionOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        StreamSession session = sessionOpt.get();
        boolean active = orchestrator.isStreamActive(sessionId);

        var response = new StreamStatusResponse(
                session.getSessionId(),
                session.getStatus().name(),
                session.getProvider().name(),
                active,
                session.getStartedAt(),
                session.getStoppedAt(),
                session.getDurationMs(),
                session.getChunksSent(),
                session.getChunksDropped(),
                session.getErrorMessage()
        );

        return ResponseEntity.ok(response);
    }

    @GetMapping("/active")
    public ResponseEntity<Long> getActiveStreamCount() {
        long count = sessionRepository.countByStatus(StreamStatus.STREAMING);
        return ResponseEntity.ok(count);
    }
}
