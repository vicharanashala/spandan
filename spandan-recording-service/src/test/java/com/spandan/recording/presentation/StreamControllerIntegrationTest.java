package com.spandan.recording.presentation;

import com.spandan.recording.application.service.StreamOrchestrator;
import com.spandan.recording.domain.entity.StreamSession;
import com.spandan.recording.domain.enums.StreamProvider;
import com.spandan.recording.domain.port.*;
import com.spandan.recording.presentation.dto.StartStreamRequest;
import com.spandan.recording.presentation.dto.StartStreamResponse;
import com.spandan.recording.presentation.dto.StopStreamResponse;
import com.spandan.recording.presentation.dto.StreamStatusResponse;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Date;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class StreamControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    static KafkaContainer kafka = new KafkaContainer(
            DockerImageName.parse("confluentinc/cp-kafka:7.6.0"));

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private StreamOrchestrator orchestrator;

    @Autowired
    private StreamSessionRepository sessionRepository;

    @Value("${auth.jwt.secret}")
    private String jwtSecret;

    @MockBean
    private TranscriptForwarderFactory forwarderFactory;

    @MockBean
    private AudioProviderFactory audioProviderFactory;

    private String teacherToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        teacherToken = generateToken("teacher-1", "TEACHER");
        adminToken = generateToken("admin-1", "ADMIN");

        TranscriptForwarder stubForwarder = new TranscriptForwarder() {
            public void sendSegment(com.spandan.recording.domain.entity.TranscriptSegment segment) {}
            public boolean isConnected() { return true; }
            public void close() {}
        };
        when(forwarderFactory.create(any())).thenReturn(stubForwarder);

        AudioProvider stubProvider = new AudioProvider() {
            public void connect(String endpoint, java.util.function.Consumer<com.spandan.recording.domain.entity.TranscriptSegment> segmentHandler,
                                Runnable onReady, java.util.function.Consumer<Throwable> onError) {
                if (onReady != null) onReady.run();
            }
            public boolean isConnected() { return true; }
            public boolean sendAudio(byte[] data, int offset, int length) { return true; }
            public void disconnect() {}
            public void close() {}
        };
        when(audioProviderFactory.create(any())).thenReturn(stubProvider);
    }

    @Test
    void shouldStartAndReturnStream() {
        StartStreamRequest request = createStartRequest();

        ResponseEntity<StartStreamResponse> response = restTemplate.exchange(
                "/api/v1/streams/start",
                HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(teacherToken)),
                StartStreamResponse.class);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(request.getSessionId(), response.getBody().getSessionId());
        assertEquals(StreamProvider.DEEPGRAM.name(), response.getBody().getProvider());

        assertTrue(sessionRepository.findBySessionId(request.getSessionId()).isPresent());
    }

    @Test
    void shouldReturnStreamStatus() {
        StartStreamRequest request = createStartRequest();

        restTemplate.exchange("/api/v1/streams/start", HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(teacherToken)), StartStreamResponse.class);

        ResponseEntity<StreamStatusResponse> statusResponse = restTemplate.exchange(
                "/api/v1/streams/" + request.getSessionId(),
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(teacherToken)),
                StreamStatusResponse.class);

        assertEquals(HttpStatus.OK, statusResponse.getStatusCode());
        assertNotNull(statusResponse.getBody());
        assertEquals(request.getSessionId(), statusResponse.getBody().getSessionId());
        assertEquals(StreamProvider.DEEPGRAM.name(), statusResponse.getBody().getProvider());
    }

    @Test
    void shouldReturn404ForNonExistentStream() {
        ResponseEntity<StreamStatusResponse> response = restTemplate.exchange(
                "/api/v1/streams/" + UUID.randomUUID(),
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(teacherToken)),
                StreamStatusResponse.class);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void shouldReturn409ForDuplicateStream() {
        StartStreamRequest request = createStartRequest();

        restTemplate.exchange("/api/v1/streams/start", HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(teacherToken)), StartStreamResponse.class);

        ResponseEntity<String> duplicateResponse = restTemplate.exchange(
                "/api/v1/streams/start",
                HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(teacherToken)),
                String.class);

        assertEquals(HttpStatus.CONFLICT, duplicateResponse.getStatusCode());
    }

    @Test
    void shouldStopActiveStream() {
        StreamSession session = orchestrator.startStream(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                com.spandan.recording.domain.enums.AudioFormat.PCM16,
                com.spandan.recording.domain.enums.StreamProvider.DEEPGRAM);

        AudioProvider mockProvider = new AudioProvider() {
            public void connect(String e, java.util.function.Consumer<com.spandan.recording.domain.entity.TranscriptSegment> h,
                                Runnable r, java.util.function.Consumer<Throwable> er) {}
            public boolean isConnected() { return false; }
            public boolean sendAudio(byte[] d, int o, int l) { return true; }
            public void disconnect() {}
            public void close() {}
        };
        TranscriptForwarder mockForwarder = new TranscriptForwarder() {
            public void sendSegment(com.spandan.recording.domain.entity.TranscriptSegment s) {}
            public boolean isConnected() { return false; }
            public void close() {}
        };
        orchestrator.registerActiveStream(session.getSessionId(), session, mockProvider, mockForwarder);

        ResponseEntity<StopStreamResponse> stopResponse = restTemplate.exchange(
                "/api/v1/streams/" + session.getSessionId() + "/stop",
                HttpMethod.POST,
                new HttpEntity<>(authHeaders(teacherToken)),
                StopStreamResponse.class);

        assertEquals(HttpStatus.OK, stopResponse.getStatusCode());
        assertNotNull(stopResponse.getBody());
        assertEquals(session.getSessionId(), stopResponse.getBody().getSessionId());
        assertTrue(stopResponse.getBody().getDurationMs() > 0);
    }

    @Test
    void shouldReturn404WhenStoppingNonexistentStream() {
        ResponseEntity<String> response = restTemplate.exchange(
                "/api/v1/streams/" + UUID.randomUUID() + "/stop",
                HttpMethod.POST,
                new HttpEntity<>(authHeaders(teacherToken)),
                String.class);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void shouldReturnActiveStreamCount() {
        ResponseEntity<Long> countResponse = restTemplate.exchange(
                "/api/v1/streams/active",
                HttpMethod.GET,
                new HttpEntity<>(authHeaders(teacherToken)),
                Long.class);

        assertEquals(HttpStatus.OK, countResponse.getStatusCode());
        assertNotNull(countResponse.getBody());
    }

    @Test
    void shouldRejectUnauthorizedRequest() {
        ResponseEntity<String> response = restTemplate.exchange(
                "/api/v1/streams/active",
                HttpMethod.GET,
                null,
                String.class);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void shouldRejectNonTeacherForStart() {
        String studentToken = generateToken("student-1", "STUDENT");
        StartStreamRequest request = createStartRequest();

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/v1/streams/start",
                HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(studentToken)),
                String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void shouldAllowAdminToStartStream() {
        StartStreamRequest request = createStartRequest();

        ResponseEntity<StartStreamResponse> response = restTemplate.exchange(
                "/api/v1/streams/start",
                HttpMethod.POST,
                new HttpEntity<>(request, authHeaders(adminToken)),
                StartStreamResponse.class);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(request.getSessionId(), response.getBody().getSessionId());
    }

    @Test
    void shouldAllowAdminToStopStream() {
        StreamSession session = orchestrator.startStream(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                com.spandan.recording.domain.enums.AudioFormat.PCM16,
                com.spandan.recording.domain.enums.StreamProvider.DEEPGRAM);

        AudioProvider mockProvider = new AudioProvider() {
            public void connect(String e, java.util.function.Consumer<com.spandan.recording.domain.entity.TranscriptSegment> h,
                                Runnable r, java.util.function.Consumer<Throwable> er) {}
            public boolean isConnected() { return false; }
            public boolean sendAudio(byte[] d, int o, int l) { return true; }
            public void disconnect() {}
            public void close() {}
        };
        TranscriptForwarder mockForwarder = new TranscriptForwarder() {
            public void sendSegment(com.spandan.recording.domain.entity.TranscriptSegment s) {}
            public boolean isConnected() { return false; }
            public void close() {}
        };
        orchestrator.registerActiveStream(session.getSessionId(), session, mockProvider, mockForwarder);

        ResponseEntity<StopStreamResponse> response = restTemplate.exchange(
                "/api/v1/streams/" + session.getSessionId() + "/stop",
                HttpMethod.POST,
                new HttpEntity<>(authHeaders(adminToken)),
                StopStreamResponse.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    private StartStreamRequest createStartRequest() {
        StartStreamRequest request = new StartStreamRequest();
        request.setTeacherId(UUID.randomUUID());
        request.setLectureId(UUID.randomUUID());
        request.setSessionId(UUID.randomUUID());
        request.setAudioFormat("PCM16");
        request.setProvider("DEEPGRAM");
        request.setProviderEndpoint("wss://deepgram.com/v1/listen");
        return request;
    }

    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return headers;
    }

    private String generateToken(String subject, String role) {
        return Jwts.builder()
                .setSubject(subject)
                .claim("role", role)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 3600000))
                .signWith(SignatureAlgorithm.HS256, jwtSecret.getBytes())
                .compact();
    }
}
