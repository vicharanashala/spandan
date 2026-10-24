package com.spandan.notification.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spandan.notification.application.dto.event.EventEnvelope;
import com.spandan.notification.domain.entity.Notification;
import com.spandan.notification.domain.enums.NotificationType;
import com.spandan.notification.infrastructure.persistence.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Testcontainers
class NotificationEventConsumerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("notification_test")
            .withUsername("test")
            .withPassword("test");

    @Container
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void cleanDatabase() {
        notificationRepository.deleteAll();
    }

    @Test
    void contextLoads() {
    }

    @Test
    void questionsGeneratedEvent_shouldCreateNotificationInDatabase() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("questionCount", 5);

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("QuestionsGenerated");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("question-generation-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification, "Expected a notification within timeout");
        assertEquals(NotificationType.QUESTIONS_GENERATED, notification.getNotificationType());
        assertEquals(teacherId, notification.getUserId());
        assertEquals("Questions Ready for Review", notification.getTitle());
    }

    @Test
    void questionGenerationFailedEvent_shouldCreateFailureNotification() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("failureReason", "AI service timeout");

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("QuestionGenerationFailed");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("question-generation-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification);
        assertEquals(NotificationType.QUESTION_GENERATION_FAILED, notification.getNotificationType());
        assertTrue(notification.getMessage().contains("AI service timeout"));
    }

    @Test
    void reviewCompletedEvent_shouldCreateNotification() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("approvedCount", 4);
        payload.put("rejectedCount", 1);
        payload.put("orphanedCount", 0);

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("ReviewCompleted");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("question-review-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification);
        assertEquals(NotificationType.REVIEW_COMPLETED, notification.getNotificationType());
        assertTrue(notification.getMessage().contains("4 approved"));
    }

    @Test
    void quizStartingEvent_shouldCreateNotificationsForStudents() throws Exception {
        UUID quizId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID student1 = UUID.randomUUID();
        UUID student2 = UUID.randomUUID();

        ArrayNode studentIds = objectMapper.createArrayNode();
        studentIds.add(student1.toString());
        studentIds.add(student2.toString());

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("sessionId", sessionId.toString());
        payload.put("quizId", quizId.toString());
        payload.put("questionCount", 10);
        payload.set("studentIds", studentIds);

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("QuizStartingEvent");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("polling-events", quizId.toString(), envelope).get(10, TimeUnit.SECONDS);

        waitForNotificationCount(2, 20000);
        List<Notification> notifications = notificationRepository.findAll();
        assertTrue(notifications.size() >= 2, "Expected at least 2 QuizStarting notifications");
        notifications.forEach(n -> {
            assertEquals(NotificationType.QUIZ_STARTING, n.getNotificationType());
            assertEquals(quizId, n.getQuizId());
        });
    }

    @Test
    void teacherAnalyticsReadyEvent_shouldCreateNotification() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID quizId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("quizId", quizId.toString());

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("TeacherAnalyticsReady");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("analytics-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification);
        assertEquals(NotificationType.TEACHER_ANALYTICS_READY, notification.getNotificationType());
        assertEquals(teacherId, notification.getUserId());
    }

    @Test
    void studentAnalyticsReadyEvent_shouldCreateNotification() throws Exception {
        UUID studentId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID quizId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("studentId", studentId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("quizId", quizId.toString());

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("StudentAnalyticsReady");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("analytics-events", studentId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification);
        assertEquals(NotificationType.STUDENT_ANALYTICS_READY, notification.getNotificationType());
        assertEquals(studentId, notification.getUserId());
    }

    @Test
    void transcriptGenerationFailedEvent_shouldCreateNotification() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("failureReason", "Provider unavailable");

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(UUID.randomUUID());
        envelope.setEventType("TranscriptGenerationFailed");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("transcription-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Notification notification = waitForNotification(15000);
        assertNotNull(notification);
        assertEquals(NotificationType.TRANSCRIPT_GENERATION_FAILED, notification.getNotificationType());
    }

    @Test
    void duplicatedEvent_shouldNotCreateDuplicateNotification() throws Exception {
        UUID teacherId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("teacherId", teacherId.toString());
        payload.put("sessionId", sessionId.toString());
        payload.put("questionCount", 5);

        EventEnvelope envelope = new EventEnvelope();
        envelope.setEventId(eventId);
        envelope.setEventType("QuestionsGenerated");
        envelope.setPayload(payload);
        envelope.setTimestamp(Instant.now());

        kafkaTemplate.send("question-generation-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);
        kafkaTemplate.send("question-generation-events", teacherId.toString(), envelope).get(10, TimeUnit.SECONDS);

        Thread.sleep(3000);
        long count = notificationRepository.count();
        assertEquals(1, count, "Dedup should prevent a second notification row");
    }

    private Notification waitForNotification(long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            List<Notification> notifications = notificationRepository.findAll();
            if (!notifications.isEmpty()) {
                return notifications.get(notifications.size() - 1);
            }
            Thread.sleep(200);
        }
        return null;
    }

    private void waitForNotificationCount(int expectedCount, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (notificationRepository.count() >= expectedCount) {
                return;
            }
            Thread.sleep(200);
        }
    }
}
