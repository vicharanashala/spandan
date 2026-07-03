package com.spandan.polling.application.service;

import com.spandan.polling.application.port.EventPublisher;
import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.application.port.QuizRepository;
import com.spandan.polling.application.port.QuizTimerRepository;
import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.enums.QuestionStatus;
import com.spandan.polling.domain.enums.QuizStatus;
import com.spandan.polling.domain.exception.IllegalStateTransitionException;
import com.spandan.polling.domain.exception.QuizNotFoundException;
import com.spandan.polling.domain.exception.UnauthorizedQuizAccessException;
import com.spandan.polling.presentation.dto.request.CreateQuizRequest;
import com.spandan.polling.presentation.dto.request.QuestionSlot;
import com.spandan.polling.presentation.dto.response.QuizResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QuizServiceTest {

    @Mock private QuizRepository quizRepository;
    @Mock private QuizQuestionRepository questionRepository;
    @Mock private QuizTimerRepository timerRepository;
    @Mock private QuizSequencer quizSequencer;
    @Mock private TimerService timerService;
    @Mock private EventPublisher eventPublisher;

    private QuizService quizService;
    private UUID teacherId;
    private UUID quizId;
    private Quiz draftQuiz;

    @BeforeEach
    void setUp() {
        StateTransitionGuard guard = new StateTransitionGuard();
        quizService = new QuizService(quizRepository, questionRepository,
                timerRepository, quizSequencer, timerService, guard, eventPublisher);

        teacherId = UUID.randomUUID();
        quizId = UUID.randomUUID();
        draftQuiz = new Quiz(quizId, teacherId, QuizStatus.DRAFT, 0, 2,
                null, null, Instant.now(), Instant.now());
    }

    @Test
    void createQuiz() {
        QuestionSlot slot1 = new QuestionSlot(UUID.randomUUID(), 1, 30);
        QuestionSlot slot2 = new QuestionSlot(UUID.randomUUID(), 2, 45);
        CreateQuizRequest request = new CreateQuizRequest(List.of(slot1, slot2));

        when(quizRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(questionRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        QuizResponse response = quizService.createQuiz(teacherId, request);

        assertNotNull(response);
        assertEquals(2, response.totalQuestions());
        assertEquals("SCHEDULED", response.quizStatus());
        verify(quizRepository).save(any());
        verify(questionRepository).saveAll(any());
    }

    @Test
    void createQuizRejectsDuplicatePositions() {
        QuestionSlot slot1 = new QuestionSlot(UUID.randomUUID(), 1, 30);
        QuestionSlot slot2 = new QuestionSlot(UUID.randomUUID(), 1, 45);
        CreateQuizRequest request = new CreateQuizRequest(List.of(slot1, slot2));

        assertThrows(IllegalArgumentException.class,
                () -> quizService.createQuiz(teacherId, request));
    }

    @Test
    void createQuizRejectsInvalidTimer() {
        QuestionSlot slot = new QuestionSlot(UUID.randomUUID(), 1, 1000);
        CreateQuizRequest request = new CreateQuizRequest(List.of(slot));

        assertThrows(IllegalArgumentException.class,
                () -> quizService.createQuiz(teacherId, request));
    }

    @Test
    void startQuiz() {
        Quiz scheduled = new Quiz(quizId, teacherId, QuizStatus.SCHEDULED, 0, 2,
                null, null, Instant.now(), Instant.now());
        QuizQuestion question = QuizQuestion.create(quizId, UUID.randomUUID(), 1, 30);

        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(scheduled));
        when(questionRepository.findByQuizIdOrderBySequencePosition(quizId))
                .thenReturn(List.of(question));
        when(quizRepository.save(any())).thenReturn(scheduled);
        doNothing().when(quizSequencer).publishQuestion(any(), any());

        QuizResponse response = quizService.startQuiz(quizId, teacherId);

        assertNotNull(response);
        assertEquals(QuizStatus.RUNNING.name(), response.quizStatus());
        verify(quizSequencer).publishQuestion(eq(quizId), any());
        verify(eventPublisher).publish(any());
    }

    @Test
    void startQuizNotOwner() {
        UUID otherTeacher = UUID.randomUUID();
        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(draftQuiz));

        assertThrows(UnauthorizedQuizAccessException.class,
                () -> quizService.startQuiz(quizId, otherTeacher));
    }

    @Test
    void startQuizNotFound() {
        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.empty());

        assertThrows(QuizNotFoundException.class,
                () -> quizService.startQuiz(quizId, teacherId));
    }

    @Test
    void startQuizAlreadyRunning() {
        Quiz running = new Quiz(quizId, teacherId, QuizStatus.RUNNING, 1, 2,
                Instant.now(), null, Instant.now(), Instant.now());
        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(running));

        assertThrows(IllegalStateTransitionException.class,
                () -> quizService.startQuiz(quizId, teacherId));
    }

    @Test
    void pauseResumeQuiz() {
        Quiz running = new Quiz(quizId, teacherId, QuizStatus.RUNNING, 1, 2,
                Instant.now(), null, Instant.now(), Instant.now());
        QuizQuestion currentQuestion = QuizQuestion.create(quizId, UUID.randomUUID(), 1, 30);

        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(running));
        when(questionRepository.findByQuizIdAndSequencePosition(quizId, 1))
                .thenReturn(Optional.of(currentQuestion));
        when(quizRepository.save(any())).thenReturn(running);

        QuizResponse pauseResponse = quizService.pauseQuiz(quizId, teacherId);
        assertEquals(QuizStatus.PAUSED.name(), pauseResponse.quizStatus());

        Quiz paused = new Quiz(quizId, teacherId, QuizStatus.PAUSED, 1, 2,
                Instant.now(), null, Instant.now(), Instant.now());
        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(paused));

        QuizResponse resumeResponse = quizService.resumeQuiz(quizId, teacherId);
        assertEquals(QuizStatus.RUNNING.name(), resumeResponse.quizStatus());
    }

    @Test
    void cancelQuestionOnlyWhenScheduled() {
        Quiz running = new Quiz(quizId, teacherId, QuizStatus.RUNNING, 1, 2,
                Instant.now(), null, Instant.now(), Instant.now());
        UUID questionId = UUID.randomUUID();
        QuizQuestion scheduledQuestion = QuizQuestion.create(quizId, UUID.randomUUID(), 2, 30);

        when(quizRepository.findByIdWithLock(quizId)).thenReturn(Optional.of(running));
        when(questionRepository.findByIdWithLock(questionId)).thenReturn(Optional.of(scheduledQuestion));
        when(questionRepository.save(any())).thenReturn(scheduledQuestion);

        assertDoesNotThrow(() -> quizService.cancelQuestion(quizId, questionId, teacherId));
        verify(questionRepository).save(any());
    }
}
