package com.spandan.gateway.presentation.controller;

import com.spandan.gateway.application.service.AnswerForwardingService;
import com.spandan.gateway.application.service.InteractionTimingService;
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
    private final InteractionTimingService timingService;

    public AnswerController(AnswerForwardingService answerForwardingService,
                            ConnectionEventProducer eventProducer,
                            InteractionTimingService timingService) {
        this.answerForwardingService = answerForwardingService;
        this.eventProducer = eventProducer;
        this.timingService = timingService;
    }

    @MessageMapping("/submit-answer")
    public void submitAnswer(@Payload AnswerSubmission submission,
                             SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (userId == null || quizId == null) {
            log.warn("Answer submission without authenticated user or quiz");
            return;
        }

        String idempotencyKey = submission.getIdempotencyKey() != null
                ? submission.getIdempotencyKey()
                : userId + ":" + submission.getQuizId() + ":" + submission.getQuestionId();

        timingService.processAnswer(quizId, null, userId,
                submission.getQuestionId(), submission.getAnswer())
            .ifPresentOrElse(
                rt -> log.info("Answer processed: userId={}, questionId={}, responseTimeMs={}",
                        userId, submission.getQuestionId(), rt),
                () -> log.warn("Answer submitted without display ack: userId={}, questionId={}",
                        userId, submission.getQuestionId())
            );

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
