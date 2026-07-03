package com.spandan.questiongen.presentation.controller;

import com.spandan.questiongen.application.service.QuestionGenerationOrchestrator;
import com.spandan.questiongen.domain.exception.GenerationException;
import com.spandan.questiongen.infrastructure.persistence.GeneratedQuestionRepository;
import com.spandan.questiongen.presentation.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/question-generation")
public class QuestionGenerationController {

    private final QuestionGenerationOrchestrator orchestrator;
    private final GeneratedQuestionRepository generatedQuestionRepository;

    public QuestionGenerationController(QuestionGenerationOrchestrator orchestrator,
                                        GeneratedQuestionRepository generatedQuestionRepository) {
        this.orchestrator = orchestrator;
        this.generatedQuestionRepository = generatedQuestionRepository;
    }

    @PostMapping("/generate")
    public ResponseEntity<Void> generate(@Valid @RequestBody GenerateRequest request,
                                         Authentication auth) {
        UUID teacherId = UUID.fromString(auth.getName());
        orchestrator.requestGeneration(request.getTranscriptId(), request.getSessionId(), teacherId);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/{setId}/regenerate")
    public ResponseEntity<Void> regenerate(@PathVariable UUID setId) {
        orchestrator.regenerate(setId);
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/{setId}")
    public ResponseEntity<QuestionSetResponse> getById(@PathVariable UUID setId) {
        var entity = orchestrator.getById(setId);
        return ResponseEntity.ok(QuestionSetResponse.from(entity));
    }

    @GetMapping("/{setId}/status")
    public ResponseEntity<StatusResponse> getStatus(@PathVariable UUID setId) {
        var entity = orchestrator.getStatus(setId);
        long count = generatedQuestionRepository.countByQuestionSetId(setId);
        return ResponseEntity.ok(StatusResponse.from(entity, (int) count));
    }

    @PostMapping("/{setId}/save")
    public ResponseEntity<QuestionSetResponse> save(@PathVariable UUID setId) {
        var entity = orchestrator.savePermanently(setId);
        return ResponseEntity.ok(QuestionSetResponse.from(entity));
    }

    @DeleteMapping("/{setId}")
    public ResponseEntity<Void> delete(@PathVariable UUID setId) {
        orchestrator.deleteSet(setId);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(GenerationException.class)
    public ResponseEntity<ErrorResponse> handleGenerationException(GenerationException e) {
        var error = new ErrorResponse(e.getStatusCode(), HttpStatus.valueOf(e.getStatusCode()).getReasonPhrase(), e.getMessage());
        return ResponseEntity.status(e.getStatusCode()).body(error);
    }
}
