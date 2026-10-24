package com.spandan.gateway.presentation.controller;

import com.spandan.gateway.presentation.dto.ActivityAck;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@Controller
public class ActivityController {

    private static final Logger log = LoggerFactory.getLogger(ActivityController.class);

    @MessageMapping("/activity-ack")
    public void acknowledgeActivity(@Payload ActivityAck ack,
                                    SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        if (userId == null) return;
        log.debug("Activity ack: userId={}, quizId={}, active={}", userId, ack.getQuizId(), ack.isActive());
    }
}
