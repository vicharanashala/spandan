package com.spandan.gateway.infrastructure.redis;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class CrossPodMessageListener {

    private final SimpMessagingTemplate messagingTemplate;

    public CrossPodMessageListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void onMessage(String message, String channel) {
        int separatorIndex = message.indexOf('|');
        if (separatorIndex == -1) return;
        String destination = message.substring(0, separatorIndex);
        String payload = message.substring(separatorIndex + 1);
        messagingTemplate.convertAndSend(destination, payload);
    }
}
