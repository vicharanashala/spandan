package com.spandan.gateway.infrastructure.websocket;

import com.spandan.gateway.application.service.WebSocketHandshakeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);
    private final WebSocketHandshakeService handshakeService;

    public WebSocketAuthInterceptor(WebSocketHandshakeService handshakeService) {
        this.handshakeService = handshakeService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = accessor.getFirstNativeHeader("Authorization");
            if (token == null || token.isBlank()) {
                throw new IllegalArgumentException("Missing Authorization header");
            }
            if (token.startsWith("Bearer ")) {
                token = token.substring(7);
            }
            try {
                Map<String, Object> userDetails = handshakeService.validateToken(token);
                accessor.setUser(() -> (String) userDetails.get("userId"));
                accessor.setSessionId((String) userDetails.get("userId"));
                accessor.getSessionAttributes().put("userId", userDetails.get("userId"));
                accessor.getSessionAttributes().put("role", userDetails.get("role"));
                accessor.getSessionAttributes().put("quizId", userDetails.get("quizId"));
            } catch (Exception e) {
                log.error("WebSocket auth failed: {}", e.getMessage());
                throw new IllegalArgumentException("Authentication failed: " + e.getMessage());
            }
        }
        return message;
    }
}
