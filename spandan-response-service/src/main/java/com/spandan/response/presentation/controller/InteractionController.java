package com.spandan.response.presentation.controller;

import com.spandan.response.domain.entity.Interaction;
import com.spandan.response.infrastructure.persistence.InteractionRepository;
import com.spandan.response.presentation.dto.InteractionResponse;
import com.spandan.response.presentation.dto.SessionSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/interactions")
public class InteractionController {

    private final InteractionRepository interactionRepository;

    public InteractionController(InteractionRepository interactionRepository) {
        this.interactionRepository = interactionRepository;
    }

    @GetMapping("/session/{sessionId}")
    public ResponseEntity<Page<InteractionResponse>> getBySession(
            @PathVariable UUID sessionId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Page<InteractionResponse> result = interactionRepository
                .findBySessionId(sessionId, PageRequest.of(page, size))
                .map(InteractionResponse::from);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session/{sessionId}/student/{studentId}")
    public ResponseEntity<List<InteractionResponse>> getBySessionAndStudent(
            @PathVariable UUID sessionId, @PathVariable UUID studentId) {
        List<InteractionResponse> result = interactionRepository
                .findBySessionIdAndStudentId(sessionId, studentId)
                .stream().map(InteractionResponse::from).toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/question/{questionId}")
    public ResponseEntity<List<InteractionResponse>> getByQuestion(@PathVariable UUID questionId) {
        List<InteractionResponse> result = interactionRepository
                .findByQuestionId(questionId)
                .stream().map(InteractionResponse::from).toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session/{sessionId}/question/{questionId}/student/{studentId}")
    public ResponseEntity<InteractionResponse> getBySessionQuestionStudent(
            @PathVariable UUID sessionId, @PathVariable UUID questionId, @PathVariable UUID studentId) {
        return interactionRepository
                .findBySessionIdAndQuestionIdAndStudentId(sessionId, questionId, studentId)
                .map(InteractionResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/session/{sessionId}/timed-out")
    public ResponseEntity<List<InteractionResponse>> getTimedOut(@PathVariable UUID sessionId) {
        List<InteractionResponse> result = interactionRepository
                .findBySessionIdAndTimeoutTrue(sessionId)
                .stream().map(InteractionResponse::from).toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session/{sessionId}/lecture/{lectureId}")
    public ResponseEntity<List<InteractionResponse>> getBySessionAndLecture(
            @PathVariable UUID sessionId, @PathVariable UUID lectureId) {
        List<InteractionResponse> result = interactionRepository
                .findBySessionIdAndLectureId(sessionId, lectureId)
                .stream().map(InteractionResponse::from).toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session/{sessionId}/summary")
    public ResponseEntity<SessionSummaryResponse> getSummary(@PathVariable UUID sessionId) {
        long total = interactionRepository.countBySessionId(sessionId);
        long answered = interactionRepository.countBySessionIdAndAnsweredTrue(sessionId);
        long timedOut = interactionRepository.countBySessionIdAndTimeoutTrue(sessionId);
        long correct = interactionRepository.findBySessionId(sessionId).stream()
                .filter(i -> Boolean.TRUE.equals(i.getIsCorrect())).count();
        long incorrect = interactionRepository.findBySessionId(sessionId).stream()
                .filter(i -> Boolean.FALSE.equals(i.getIsCorrect())).count();
        return ResponseEntity.ok(new SessionSummaryResponse(sessionId, total, answered, timedOut, correct, incorrect));
    }

    @GetMapping("/session/{sessionId}/analytics/raw")
    public ResponseEntity<List<InteractionResponse>> getAnalyticsRaw(@PathVariable UUID sessionId) {
        List<InteractionResponse> result = interactionRepository
                .findBySessionId(sessionId)
                .stream().map(InteractionResponse::from).toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/session/{sessionId}/analytics/questions")
    public ResponseEntity<List<InteractionResponse>> getAnalyticsQuestions(@PathVariable UUID sessionId) {
        return getAnalyticsRaw(sessionId);
    }

    @GetMapping("/session/{sessionId}/analytics/students")
    public ResponseEntity<List<InteractionResponse>> getAnalyticsStudents(@PathVariable UUID sessionId) {
        return getAnalyticsRaw(sessionId);
    }
}
