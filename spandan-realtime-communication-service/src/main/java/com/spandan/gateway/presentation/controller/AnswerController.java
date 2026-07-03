package com.spandan.gateway.presentation.controller;

import com.spandan.gateway.application.service.AnswerForwardingService;
import com.spandan.gateway.infrastructure.kafka.producers.ConnectionEventProducer;
import com.spandan.gateway.presentation.dto.AnswerSubmission;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@Controller
public class AnswerController {

    private static final Logger log = LoggerFactory.getLogger(AnswerController.class);
    private final AnswerForwardingService answerForwardingService;
    private final ConnectionEventProducer eventProducer;

    public AnswerController(AnswerForwardingService answerForwardingService,
                            ConnectionEventProducer eventProducer) {
        this.answerForwardingService = answerForwardingService;
        this.eventProducer = eventProducer;
    }

    @MessageMapping("/submit-answer")
    public void submitAnswer(@Payload AnswerSubmission submission,
                             SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        if (userId == null) {
            log.warn("Answer submission without authenticated user");
            return;
        }
        String idempotencyKey = submission.getIdempotencyKey() != null
                ? submission.getIdempotencyKey()
                : userId + ":" + submission.getQuizId() + ":" + submission.getQuestionId();

        answerForwardingService.forwardAnswer(
                userId,
                submission.getQuizId(),
                submission.getQuestionId(),
                submission.getAnswer(),
                idempotencyKey
        );
        eventProducer.studentResponseReceived(userId, submission.getQuizId(), submission.getQuestionId());
        log.info("Answer forwarded: userId={}, quizId={}, questionId={}", userId, submission.getQuizId(), submission.getQuestionId());
    }
}
