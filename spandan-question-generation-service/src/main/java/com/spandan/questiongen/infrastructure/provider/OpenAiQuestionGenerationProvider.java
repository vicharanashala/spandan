package com.spandan.questiongen.infrastructure.provider;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.questiongen.domain.port.QuestionGenerationProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Component
public class OpenAiQuestionGenerationProvider implements QuestionGenerationProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenAiQuestionGenerationProvider.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String model;
    private final String apiUrl;

    public OpenAiQuestionGenerationProvider(RestTemplate restTemplate, ObjectMapper objectMapper,
                                            @Value("${OPENAI_API_KEY:}") String apiKey,
                                            @Value("${OPENAI_MODEL:gpt-4}") String model,
                                            @Value("${OPENAI_API_URL:https://api.openai.com/v1/chat/completions}") String apiUrl) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        this.model = model;
        this.apiUrl = apiUrl;
    }

    @Override
    public String name() { return "openai"; }

    @Override
    public GenerationResult generate(GenerationRequest request) {
        long start = System.currentTimeMillis();
        try {
            String prompt = request.promptTemplate()
                .replace("{{transcript_text}}", request.transcriptText())
                .replace("{{mcq_count}}", String.valueOf(request.mcqCount()))
                .replace("{{true_false_count}}", String.valueOf(request.trueFalseCount()))
                .replace("{{short_answer_count}}", String.valueOf(request.shortAnswerCount()));

            var body = Map.of(
                "model", model,
                "messages", List.of(Map.of("role", "user", "content", prompt)),
                "temperature", 0.7,
                "max_tokens", 4000
            );

            var headers = new HttpHeaders();
            headers.setBearerAuth(apiKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            var entity = new HttpEntity<>(body, headers);
            var response = restTemplate.exchange(apiUrl, HttpMethod.POST, entity, String.class);

            long elapsed = System.currentTimeMillis() - start;
            var questions = parseResponse(response.getBody());

            return new GenerationResult(questions, elapsed, true, null);
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("OpenAI generation failed after {}ms", elapsed, e);
            return new GenerationResult(List.of(), elapsed, false, e.getMessage());
        }
    }

    private List<GeneratedQuestionData> parseResponse(String responseBody) {
        var questions = new ArrayList<GeneratedQuestionData>();
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            String content = root.path("choices").get(0).path("message").path("content").asText();
            JsonNode questionsArray = objectMapper.readTree(content);
            if (questionsArray.isArray()) {
                for (JsonNode q : questionsArray) {
                    String type = q.path("question_type").asText().toUpperCase().replace("-", "_");
                    String text = q.path("question_text").asText();
                    String answer = q.path("correct_answer").asText();
                    Map<String, String> options = new LinkedHashMap<>();
                    JsonNode optsNode = q.path("options");
                    if (optsNode.isObject()) {
                        optsNode.fieldNames().forEachRemaining(k -> options.put(k, optsNode.get(k).asText()));
                    }
                    questions.add(new GeneratedQuestionData(type, text, options, answer));
                }
            }
        } catch (JsonProcessingException e) {
            log.error("Failed to parse OpenAI response", e);
        }
        return questions;
    }
}
