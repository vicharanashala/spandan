package com.spandan.gateway.infrastructure.websocket;

import com.spandan.gateway.domain.enums.UserRole;
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
public class AdminChannelSubscriptionInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AdminChannelSubscriptionInterceptor.class);

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }

        String destination = accessor.getDestination();
        if (destination == null || !destination.endsWith("/admin")) {
            return message;
        }

        Map<String, Object> sessionAttrs = accessor.getSessionAttributes();
        if (sessionAttrs == null) {
            log.warn("No session attributes for subscribe to admin channel");
            throw new IllegalArgumentException("Authentication required for admin channel");
        }

        String role = (String) sessionAttrs.get("role");
        if (!UserRole.ADMIN.name().equals(role)) {
            log.warn("Non-admin attempted to subscribe to admin channel: role={}, destination={}", role, destination);
            throw new IllegalArgumentException("Only ADMIN role may subscribe to /topic/quiz/{quizId}/admin");
        }

        log.debug("Admin subscribed to admin channel: destination={}", destination);
        return message;
    }
}
