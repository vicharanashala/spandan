package com.spandan.notification.presentation.dto;

import com.spandan.notification.domain.exception.NotificationException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class ErrorResponse {

    @ExceptionHandler(NotificationException.class)
    public ResponseEntity<Map<String, Object>> handleNotificationException(NotificationException e, HttpServletRequest request) {
        return ResponseEntity.status(e.getHttpStatus()).body(Map.of(
                "error", e.getErrorCode(),
                "message", e.getMessage(),
                "status", e.getHttpStatus(),
                "timestamp", Instant.now().toString(),
                "path", request.getRequestURI()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(Map.of(
                "error", "VALIDATION_FAILED",
                "message", e.getFieldErrors().stream()
                        .map(f -> f.getField() + ": " + f.getDefaultMessage())
                        .reduce((a, b) -> a + "; " + b).orElse("Invalid request"),
                "status", 400,
                "timestamp", Instant.now().toString(),
                "path", request.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneral(Exception e, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", "INTERNAL_ERROR",
                "message", "An unexpected error occurred",
                "status", 500,
                "timestamp", Instant.now().toString(),
                "path", request.getRequestURI()));
    }
}
