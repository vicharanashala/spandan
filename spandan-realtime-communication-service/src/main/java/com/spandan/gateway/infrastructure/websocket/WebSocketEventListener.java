package com.spandan.gateway.infrastructure.websocket;

import com.spandan.gateway.application.port.ConnectionSessionRepository;
import com.spandan.gateway.domain.entity.ConnectionSession;
import com.spandan.gateway.domain.enums.UserRole;
import com.spandan.gateway.infrastructure.kafka.producers.ConnectionEventProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.UUID;

@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);
    private final ConnectionSessionRepository sessionRepository;
    private final ConnectionEventProducer eventProducer;

    public WebSocketEventListener(ConnectionSessionRepository sessionRepository,
                                  ConnectionEventProducer eventProducer) {
        this.sessionRepository = sessionRepository;
        this.eventProducer = eventProducer;
    }

    @EventListener
    public void handleSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Map<String, Object> sessionAttrs = accessor.getSessionAttributes();
        if (sessionAttrs == null) return;

        String userId = (String) sessionAttrs.get("userId");
        String role = (String) sessionAttrs.get("role");
        String quizId = (String) sessionAttrs.get("quizId");
        String sessionId = accessor.getSessionId() != null ? accessor.getSessionId() : UUID.randomUUID().toString();
        String podId = UUID.randomUUID().toString();

        if (userId != null && role != null) {
            UserRole userRole = "TEACHER".equals(role) ? UserRole.TEACHER : UserRole.STUDENT;
            ConnectionSession session = new ConnectionSession(sessionId, userId, userRole, quizId, podId);
            sessionRepository.save(session);
            if (userRole == UserRole.STUDENT) {
                eventProducer.studentConnected(userId, quizId, sessionId);
            } else {
                eventProducer.teacherConnected(userId, quizId, sessionId);
            }
            log.info("Session connected: userId={}, role={}, sessionId={}", userId, role, sessionId);
        }
    }

    @EventListener
    public void handleSessionDisconnected(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Map<String, Object> sessionAttrs = accessor.getSessionAttributes();
        if (sessionAttrs == null) return;

        String userId = (String) sessionAttrs.get("userId");
        String quizId = (String) sessionAttrs.get("quizId");
        String sessionId = accessor.getSessionId();

        if (userId != null && sessionId != null) {
            sessionRepository.findBySessionId(sessionId).ifPresent(session -> {
                sessionRepository.deleteBySessionId(sessionId);
                if (session.getRole() == UserRole.STUDENT) {
                    eventProducer.studentDisconnected(userId, quizId, sessionId);
                } else {
                    eventProducer.teacherDisconnected(userId, quizId, sessionId);
                }
                log.info("Session disconnected: userId={}, sessionId={}", userId, sessionId);
            });
        }
    }
}
