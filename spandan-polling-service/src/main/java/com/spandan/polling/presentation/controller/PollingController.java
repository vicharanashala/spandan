package com.spandan.polling.presentation.controller;

import com.spandan.polling.application.service.QuizService;
import com.spandan.polling.presentation.dto.request.CreateQuizRequest;
import com.spandan.polling.presentation.dto.response.CurrentPollResponse;
import com.spandan.polling.presentation.dto.response.QuizDetailResponse;
import com.spandan.polling.presentation.dto.response.QuizResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/polling")
public class PollingController {

    private final QuizService quizService;

    public PollingController(QuizService quizService) {
        this.quizService = quizService;
    }

    @PostMapping("/quizzes")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> createQuiz(
            @Valid @RequestBody CreateQuizRequest request,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.createQuiz(adminId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/quizzes/{quizId}/start")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> startQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.startQuiz(quizId, adminId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/pause")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> pauseQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.pauseQuiz(quizId, adminId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/resume")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> resumeQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.resumeQuiz(quizId, adminId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/end")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> endQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.endQuiz(quizId, adminId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<QuizResponse> cancelQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        QuizResponse response = quizService.cancelQuiz(quizId, adminId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/questions/{questionId}/skip")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> skipQuestion(
            @PathVariable UUID quizId,
            @PathVariable UUID questionId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        quizService.skipQuestion(quizId, questionId, adminId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/quizzes/{quizId}/questions/{questionId}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> cancelQuestion(
            @PathVariable UUID quizId,
            @PathVariable UUID questionId,
            Authentication authentication) {
        UUID adminId = UUID.fromString(authentication.getName());
        quizService.cancelQuestion(quizId, questionId, adminId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/quizzes/{quizId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public ResponseEntity<QuizDetailResponse> getQuizDetails(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID userId = UUID.fromString(authentication.getName());
        String role = authentication.getAuthorities().stream()
            .findFirst().map(g -> g.getAuthority().replace("ROLE_", "")).orElse("");
        QuizDetailResponse response = quizService.getQuizDetails(quizId, userId, role);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/quizzes/{quizId}/current")
    @PreAuthorize("permitAll()")
    public ResponseEntity<CurrentPollResponse> getCurrentPoll(@PathVariable UUID quizId) {
        CurrentPollResponse response = quizService.getCurrentPoll(quizId);
        return ResponseEntity.ok(response);
    }
}
