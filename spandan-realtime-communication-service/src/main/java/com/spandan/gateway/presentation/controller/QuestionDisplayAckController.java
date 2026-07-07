package com.spandan.gateway.presentation.controller;

import com.spandan.gateway.application.port.ActivePollRepository;
import com.spandan.gateway.application.service.InteractionTimingService;
import com.spandan.gateway.domain.entity.ActivePoll;
import com.spandan.gateway.presentation.dto.QuestionDisplayAck;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.time.Instant;
import java.util.Optional;

@Controller
public class QuestionDisplayAckController {

    private static final Logger log = LoggerFactory.getLogger(QuestionDisplayAckController.class);
    private final InteractionTimingService interactionTimingService;
    private final ActivePollRepository activePollRepository;

    public QuestionDisplayAckController(InteractionTimingService interactionTimingService,
                                         ActivePollRepository activePollRepository) {
        this.interactionTimingService = interactionTimingService;
        this.activePollRepository = activePollRepository;
    }

    @MessageMapping("/question-display-ack")
    public void handleDisplayAck(@Payload QuestionDisplayAck ack,
                                  SimpMessageHeaderAccessor headerAccessor) {
        String userId = (String) headerAccessor.getSessionAttributes().get("userId");
        String quizId = (String) headerAccessor.getSessionAttributes().get("quizId");
        if (userId == null || quizId == null) {
            log.warn("Question display ack without authenticated user or quiz");
            return;
        }

        log.info("Question display ack: userId={}, quizId={}, questionId={}",
                userId, quizId, ack.getQuestionId());

        Optional<ActivePoll> activePoll = activePollRepository.findBySessionId(quizId);
        if (activePoll.isEmpty()) {
            log.warn("No active poll found for quizId={}", quizId);
            return;
        }

        ActivePoll poll = activePoll.get();
        boolean recorded = interactionTimingService.recordQuestionDisplayed(
                quizId,
                poll.getLectureId(),
                userId,
                ack.getQuestionId(),
                poll.getSectionId(),
                poll.getSubsectionId(),
                poll.getTopicId(),
                poll.getConceptId(),
                poll.getQuestionSequence(),
                Instant.now()
        );

        if (recorded) {
            log.info("Question display recorded: userId={}, questionId={}", userId, ack.getQuestionId());
        } else {
            log.warn("Duplicate question display ack: userId={}, questionId={}", userId, ack.getQuestionId());
        }
    }
}
