package com.spandan.polling.presentation.controller;

import com.spandan.polling.application.service.QuizService;
import com.spandan.polling.presentation.dto.request.CreateQuizRequest;
import com.spandan.polling.presentation.dto.response.CurrentPollResponse;
import com.spandan.polling.presentation.dto.response.QuizDetailResponse;
import com.spandan.polling.presentation.dto.response.QuizResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<QuizResponse> createQuiz(
            @Valid @RequestBody CreateQuizRequest request,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.createQuiz(teacherId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/quizzes/{quizId}/start")
    public ResponseEntity<QuizResponse> startQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.startQuiz(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/pause")
    public ResponseEntity<QuizResponse> pauseQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.pauseQuiz(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/resume")
    public ResponseEntity<QuizResponse> resumeQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.resumeQuiz(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/end")
    public ResponseEntity<QuizResponse> endQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.endQuiz(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/cancel")
    public ResponseEntity<QuizResponse> cancelQuiz(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizResponse response = quizService.cancelQuiz(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/quizzes/{quizId}/questions/{questionId}/cancel")
    public ResponseEntity<Void> cancelQuestion(
            @PathVariable UUID quizId,
            @PathVariable UUID questionId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        quizService.cancelQuestion(quizId, questionId, teacherId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/quizzes/{quizId}")
    public ResponseEntity<QuizDetailResponse> getQuizDetails(
            @PathVariable UUID quizId,
            Authentication authentication) {
        UUID teacherId = UUID.fromString(authentication.getPrincipal().toString());
        QuizDetailResponse response = quizService.getQuizDetails(quizId, teacherId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/quizzes/{quizId}/current")
    public ResponseEntity<CurrentPollResponse> getCurrentPoll(@PathVariable UUID quizId) {
        CurrentPollResponse response = quizService.getCurrentPoll(quizId);
        return ResponseEntity.ok(response);
    }
}
