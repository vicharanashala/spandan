package com.spandan.polling.application.service;

import com.spandan.polling.application.mapper.QuizMapper;
import com.spandan.polling.application.port.EventPublisher;
import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.application.port.QuizRepository;
import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.entity.QuizTimer;
import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.QuizStatus;
import com.spandan.polling.domain.exception.IllegalStateTransitionException;
import com.spandan.polling.domain.exception.QuestionNotFoundException;
import com.spandan.polling.domain.exception.QuizNotFoundException;
import com.spandan.polling.domain.exception.UnauthorizedQuizAccessException;
import com.spandan.polling.infrastructure.kafka.PollingEvent;
import com.spandan.polling.presentation.dto.request.CreateQuizRequest;
import com.spandan.polling.presentation.dto.request.QuestionSlot;
import com.spandan.polling.presentation.dto.response.CurrentPollResponse;
import com.spandan.polling.presentation.dto.response.QuizDetailResponse;
import com.spandan.polling.presentation.dto.response.QuizResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class QuizService {

    private static final Logger log = LoggerFactory.getLogger(QuizService.class);

    private final QuizRepository quizRepository;
    private final QuizQuestionRepository questionRepository;
    private final QuizTimerRepository timerRepository;
    private final QuizSequencer quizSequencer;
    private final TimerService timerService;
    private final StateTransitionGuard transitionGuard;
    private final EventPublisher eventPublisher;

    public QuizService(QuizRepository quizRepository,
                       QuizQuestionRepository questionRepository,
                       QuizTimerRepository timerRepository,
                       QuizSequencer quizSequencer,
                       TimerService timerService,
                       StateTransitionGuard transitionGuard,
                       EventPublisher eventPublisher) {
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.timerRepository = timerRepository;
        this.quizSequencer = quizSequencer;
        this.timerService = timerService;
        this.transitionGuard = transitionGuard;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public QuizResponse createQuiz(UUID adminId, CreateQuizRequest request) {
        validateNoDuplicatePositions(request.questions());
        validateTimerBounds(request.questions());

        UUID teacherId = request.teacherId();
        if (teacherId == null) {
            throw new IllegalArgumentException("teacherId is required when creating a quiz");
        }

        Quiz quiz = Quiz.create(teacherId, adminId, request.questions().size(),
                request.lectureId(), request.sectionId(), request.subsectionId());
        quiz.markScheduled();
        quiz = quizRepository.save(quiz);

        UUID quizId = quiz.getId();
        List<QuizQuestion> questions = request.questions().stream()
                .map(slot -> QuizQuestion.create(
                        quizId, slot.questionRefId(),
                        slot.sequencePosition(), slot.timerDurationSeconds(),
                        request.lectureId(), request.sectionId(), request.subsectionId(),
                        slot.topicId(), slot.conceptId(), slot.learningObjectiveId(),
                        slot.difficulty(), slot.questionType(), slot.correctAnswer()))
                .toList();

        questionRepository.saveAll(questions);

        log.info("Created quiz {} with {} questions (teacher: {}, admin: {})", quizId, questions.size(), teacherId, adminId);
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuizResponse startQuiz(UUID quizId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        try {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), QuizStatus.RUNNING);
        } catch (IllegalStateException e) {
            throw new IllegalStateTransitionException("Cannot start quiz in state " + quiz.getQuizStatus());
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderBySequencePosition(quizId);
        if (questions.isEmpty()) {
            throw new IllegalStateTransitionException("Cannot start quiz with no questions");
        }

        quiz.start(questions.get(0).getId());
        quizRepository.save(quiz);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "QuizStartingEvent", quizId, null, null, null,
                Instant.now(), null, quiz.getTotalQuestions(), quiz.getTeacherId(),
                quiz.getLectureId(), quiz.getSectionId(), null,
                null, null, null, null, null, null, quizId,
                adminId
        ));

        quizSequencer.publishQuestion(quizId, questions.get(0));

        log.info("Started quiz {} by admin {} (teacher: {})", quizId, adminId, quiz.getTeacherId());
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuizResponse pauseQuiz(UUID quizId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        try {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), QuizStatus.PAUSED);
        } catch (IllegalStateException e) {
            throw new IllegalStateTransitionException("Cannot pause quiz in state " + quiz.getQuizStatus());
        }

        QuizQuestion currentQuestion = findCurrentQuestion(quiz);
        if (currentQuestion != null && currentQuestion.isRunning()) {
            timerService.pauseTimer(quizId, currentQuestion.getId());
        }

        quiz.pause();
        quizRepository.save(quiz);

        log.info("Paused quiz {} by admin {}", quizId, adminId);
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuizResponse resumeQuiz(UUID quizId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        try {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), QuizStatus.RUNNING);
        } catch (IllegalStateException e) {
            throw new IllegalStateTransitionException("Cannot resume quiz in state " + quiz.getQuizStatus());
        }

        quiz.resume();
        quizRepository.save(quiz);

        QuizQuestion currentQuestion = findCurrentQuestion(quiz);
        if (currentQuestion != null) {
            timerService.resumeTimer(quizId, currentQuestion.getId());
        }

        log.info("Resumed quiz {} by admin {}", quizId, adminId);
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuizResponse endQuiz(UUID quizId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        QuizQuestion currentQuestion = findCurrentQuestion(quiz);
        if (currentQuestion != null && !currentQuestion.isTerminal()) {
            forceCloseQuestion(currentQuestion);
        }

        try {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), QuizStatus.COMPLETED);
        } catch (IllegalStateException e) {
            throw new IllegalStateTransitionException("Cannot end quiz in state " + quiz.getQuizStatus());
        }

        quiz.complete();
        quizRepository.save(quiz);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "QuizCompleted", quizId, null, null, null,
                Instant.now(), null, quiz.getTotalQuestions(), quiz.getTeacherId(),
                quiz.getLectureId(), quiz.getSectionId(), null,
                null, null, null, null, null, null, quizId,
                adminId
        ));

        log.info("Ended quiz {} by admin {} (teacher: {})", quizId, adminId, quiz.getTeacherId());
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public QuizResponse cancelQuiz(UUID quizId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        try {
            transitionGuard.guardQuizTransition(quiz.getQuizStatus(), QuizStatus.CANCELLED);
        } catch (IllegalStateException e) {
            throw new IllegalStateTransitionException("Cannot cancel quiz in state " + quiz.getQuizStatus());
        }

        UUID lastQuestionId = null;
        QuizQuestion currentQuestion = findCurrentQuestion(quiz);
        if (currentQuestion != null && !currentQuestion.isTerminal()) {
            forceCloseQuestion(currentQuestion);
            lastQuestionId = currentQuestion.getId();
        }

        quiz.cancel();
        quizRepository.save(quiz);

        eventPublisher.publish(new PollingEvent(
                UUID.randomUUID(), "QuizCancelled", quizId, lastQuestionId, null, null,
                Instant.now(), null, null, quiz.getTeacherId(),
                quiz.getLectureId(), quiz.getSectionId(), null,
                null, null, null, null, null, null, quizId,
                adminId
        ));

        log.info("Cancelled quiz {} by admin {} (teacher: {})", quizId, adminId, quiz.getTeacherId());
        return QuizMapper.toResponse(quiz);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public void skipQuestion(UUID quizId, UUID questionId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        QuizQuestion currentQuestion = questionRepository.findByIdWithLock(questionId)
                .orElseThrow(() -> new QuestionNotFoundException(questionId));

        if (!currentQuestion.isRunning() && !currentQuestion.isPollOpen()
                && currentQuestion.getQuestionStatus() != QuestionStatus.PUBLISHED
                && currentQuestion.getQuestionStatus() != QuestionStatus.TIMER_EXPIRED) {
            throw new IllegalStateTransitionException(
                    "Can only skip a question in POLL_OPEN, RUNNING, or TIMER_EXPIRED state, current: "
                            + currentQuestion.getQuestionStatus());
        }

        quizSequencer.advanceToNextQuestion(quizId, questionId);

        log.info("Admin {} skipped question {} in quiz {} (teacher: {})", adminId, questionId, quizId, quiz.getTeacherId());
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public void cancelQuestion(UUID quizId, UUID questionId, UUID adminId) {
        Quiz quiz = quizRepository.findByIdWithLock(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        verifyAdminOwnership(quiz, adminId);

        QuizQuestion question = questionRepository.findByIdWithLock(questionId)
                .orElseThrow(() -> new QuestionNotFoundException(questionId));

        if (!question.isScheduled()) {
            throw new IllegalStateTransitionException(
                    "Can only cancel a SCHEDULED question, current: " + question.getQuestionStatus());
        }

        question.cancel();
        questionRepository.save(question);

        log.info("Admin {} cancelled question {} in quiz {} (teacher: {})", adminId, questionId, quizId, quiz.getTeacherId());
    }

    @Transactional(readOnly = true)
    public QuizDetailResponse getQuizDetails(UUID quizId, UUID userId, String role) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        if ("ADMIN".equals(role)) {
            verifyAdminOwnership(quiz, userId);
        } else {
            if (!quiz.getTeacherId().equals(userId)) {
                throw new UnauthorizedQuizAccessException(quizId, userId.toString());
            }
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderBySequencePosition(quizId);
        return QuizMapper.toDetailResponse(quiz, questions);
    }

    @Transactional(readOnly = true)
    public CurrentPollResponse getCurrentPoll(UUID quizId) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new QuizNotFoundException(quizId));

        if (quiz.getQuizStatus() == QuizStatus.DRAFT
                || quiz.getQuizStatus() == QuizStatus.SCHEDULED
                || quiz.isTerminal()) {
            throw new IllegalStateTransitionException("No active poll for quiz in state " + quiz.getQuizStatus());
        }

        QuizQuestion currentQuestion = findCurrentQuestion(quiz);
        if (currentQuestion == null) {
            throw new IllegalStateTransitionException("No current question found");
        }

        int remainingSeconds = timerService.getRemainingSeconds(currentQuestion.getId());
        return QuizMapper.toCurrentPollResponse(quiz, currentQuestion, remainingSeconds);
    }

    private QuizQuestion findCurrentQuestion(Quiz quiz) {
        int currentPosition = quiz.getCurrentQuestionNumber();
        if (currentPosition <= 0) return null;
        return questionRepository.findByQuizIdAndSequencePosition(
                quiz.getId(), currentPosition).orElse(null);
    }

    private void forceCloseQuestion(QuizQuestion question) {
        if (question.isRunning() || question.isPollOpen()
                || question.getQuestionStatus() == QuestionStatus.PUBLISHED) {
            QuizTimer timer = timerRepository.findByQuizQuestionId(question.getId())
                    .orElse(null);
            if (timer != null && timer.getTimerStatus() == com.spandan.polling.domain.enums.TimerStatus.RUNNING) {
                timer.expire();
                timerRepository.save(timer);
            }
            if (question.isRunning() || question.isPollOpen()) {
                question.expireTimer();
            }
            question.closePoll();
            questionRepository.save(question);
        }
    }

    private void verifyAdminOwnership(Quiz quiz, UUID adminId) {
        if (!quiz.getAdminId().equals(adminId)) {
            throw new UnauthorizedQuizAccessException(quiz.getId(), adminId.toString());
        }
    }

    private void validateNoDuplicatePositions(List<QuestionSlot> slots) {
        Set<Integer> positions = slots.stream()
                .map(QuestionSlot::sequencePosition)
                .collect(Collectors.toSet());
        if (positions.size() != slots.size()) {
            throw new IllegalArgumentException("Duplicate sequence positions are not allowed");
        }
    }

    private void validateTimerBounds(List<QuestionSlot> slots) {
        for (QuestionSlot slot : slots) {
            if (slot.timerDurationSeconds() < 5 || slot.timerDurationSeconds() > 600) {
                throw new IllegalArgumentException(
                        "Timer duration must be between 5 and 600 seconds, got: " + slot.timerDurationSeconds());
            }
        }
    }
}
