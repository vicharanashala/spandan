package com.spandan.gateway.infrastructure.websocket;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor authInterceptor;
    private final AdminChannelSubscriptionInterceptor adminSubscriptionInterceptor;
    private final long heartbeatTime;
    private final long maxFrameSize;
    private final long maxSessionIdleTime;

    public WebSocketConfig(WebSocketAuthInterceptor authInterceptor,
                           AdminChannelSubscriptionInterceptor adminSubscriptionInterceptor,
                           @Value("${websocket.heartbeat-time}") long heartbeatTime,
                           @Value("${websocket.max-frame-size}") long maxFrameSize,
                           @Value("${websocket.max-session-idle-time}") long maxSessionIdleTime) {
        this.authInterceptor = authInterceptor;
        this.adminSubscriptionInterceptor = adminSubscriptionInterceptor;
        this.heartbeatTime = heartbeatTime;
        this.maxFrameSize = maxFrameSize;
        this.maxSessionIdleTime = maxSessionIdleTime;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/user", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor, adminSubscriptionInterceptor);
    }
}
