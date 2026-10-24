package com.spandan.polling.integration;

import com.spandan.polling.SpandanPollingApplication;
import com.spandan.polling.application.port.QuizQuestionRepository;
import com.spandan.polling.application.port.QuizRepository;
import com.spandan.polling.domain.entity.Quiz;
import com.spandan.polling.domain.entity.QuizQuestion;
import com.spandan.polling.domain.enums.QuizStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, classes = SpandanPollingApplication.class)
@ActiveProfiles("test")
@Testcontainers
class QuizLifecycleIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("polling_db")
            .withUsername("test")
            .withPassword("test");

    @Container
    static KafkaContainer kafka = new KafkaContainer(
            DockerImageName.parse("confluentinc/cp-kafka:7.6.0"));

    @Autowired
    private QuizRepository quizRepository;

    @Autowired
    private QuizQuestionRepository questionRepository;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Test
    void fullQuizLifecycle() {
        UUID teacherId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Quiz created = Quiz.create(teacherId, adminId, 1);
        created.markScheduled();
        quizRepository.save(created);

        UUID questionRefId = UUID.randomUUID();
        QuizQuestion question = QuizQuestion.create(created.getId(), questionRefId, 1, 30);
        questionRepository.save(question);

        Quiz found = quizRepository.findById(created.getId()).orElseThrow();
        assertEquals(QuizStatus.SCHEDULED, found.getQuizStatus());

        List<QuizQuestion> questions = questionRepository
                .findByQuizIdOrderBySequencePosition(created.getId());
        assertEquals(1, questions.size());
        assertEquals(questionRefId, questions.get(0).getQuestionRefId());
    }
}
