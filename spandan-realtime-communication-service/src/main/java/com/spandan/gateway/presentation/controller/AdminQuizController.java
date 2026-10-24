package com.spandan.gateway.presentation.controller;

import com.spandan.gateway.application.service.MessageRoutingService;
import com.spandan.gateway.domain.enums.UserRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Controller
public class AdminQuizController {

    private static final Logger log = LoggerFactory.getLogger(AdminQuizController.class);
    private final MessageRoutingService routingService;

    public AdminQuizController(MessageRoutingService routingService) {
        this.routingService = routingService;
    }

    @MessageMapping("/publish-question")
    public void publishQuestion(@Payload Map<String, Object> command,
                                 SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String role = (String) headerAccessor.getSessionAttributes().get("role");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (!isAdmin(role, userId, "publish question")) return;
        log.info("Admin publish question: userId={}, quizId={}", userId, quizId);
        routingService.broadcastToAdmin(quizId, buildEvent("QuestionPublished", userId, quizId));
        routingService.broadcastToQuiz(quizId, command);
    }

    @MessageMapping("/pause-quiz")
    public void pauseQuiz(@Payload Map<String, Object> command,
                           SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String role = (String) headerAccessor.getSessionAttributes().get("role");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (!isAdmin(role, userId, "pause quiz")) return;
        log.info("Admin pause quiz: userId={}, quizId={}", userId, quizId);
        Map<String, Object> event = buildEvent("QuizPaused", userId, quizId);
        event.put("pausedAt", Instant.now().toString());
        routingService.broadcastToAdmin(quizId, event);
        routingService.broadcastToQuiz(quizId, event);
    }

    @MessageMapping("/resume-quiz")
    public void resumeQuiz(@Payload Map<String, Object> command,
                            SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String role = (String) headerAccessor.getSessionAttributes().get("role");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (!isAdmin(role, userId, "resume quiz")) return;
        log.info("Admin resume quiz: userId={}, quizId={}", userId, quizId);
        Map<String, Object> event = buildEvent("QuizResumed", userId, quizId);
        event.put("resumedAt", Instant.now().toString());
        routingService.broadcastToAdmin(quizId, event);
        routingService.broadcastToQuiz(quizId, event);
    }

    @MessageMapping("/cancel-quiz")
    public void cancelQuiz(@Payload Map<String, Object> command,
                            SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String role = (String) headerAccessor.getSessionAttributes().get("role");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (!isAdmin(role, userId, "cancel quiz")) return;
        String reason = command != null ? (String) command.get("reason") : null;
        log.info("Admin cancel quiz: userId={}, quizId={}, reason={}", userId, quizId, reason);
        Map<String, Object> event = buildEvent("QuizCancelled", userId, quizId);
        event.put("cancelledAt", Instant.now().toString());
        event.put("reason", reason);
        routingService.broadcastToAdmin(quizId, event);
        routingService.broadcastToQuiz(quizId, event);
    }

    @MessageMapping("/end-quiz")
    public void endQuiz(@Payload Map<String, Object> command,
                         SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String role = (String) headerAccessor.getSessionAttributes().get("role");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (!isAdmin(role, userId, "end quiz")) return;
        log.info("Admin end quiz: userId={}, quizId={}", userId, quizId);
        Map<String, Object> event = buildEvent("QuizEnded", userId, quizId);
        event.put("endedAt", Instant.now().toString());
        routingService.broadcastToAdmin(quizId, event);
        routingService.broadcastToQuiz(quizId, event);
    }

    private boolean isAdmin(String role, String userId, String action) {
        if (!UserRole.ADMIN.name().equals(role)) {
            log.warn("Non-admin attempted {}: userId={}, role={}", action, userId, role);
            return false;
        }
        return true;
    }

    private Map<String, Object> buildEvent(String eventType, String userId, String quizId) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("eventType", eventType);
        event.put("type", eventType);
        event.put("userId", userId);
        event.put("quizId", quizId);
        event.put("adminId", userId);
        return event;
    }
}
