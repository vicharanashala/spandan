package com.spandan.questiongen.application.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

@Service
public class TranscriptServiceClient {

    private static final Logger log = LoggerFactory.getLogger(TranscriptServiceClient.class);

    private final RestTemplate restTemplate;
    private final String transcriptionServiceUrl;

    public TranscriptServiceClient(@Qualifier("restTemplate") RestTemplate restTemplate,
                                   @Value("${transcription.service.url:http://localhost:8085}") String transcriptionServiceUrl) {
        this.restTemplate = restTemplate;
        this.transcriptionServiceUrl = transcriptionServiceUrl;
    }

    public String getTranscriptText(UUID transcriptId) {
        try {
            String url = transcriptionServiceUrl + "/api/v1/transcripts/session/" + transcriptId;
            var response = restTemplate.getForEntity(url, String.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
            log.warn("Failed to fetch transcript {}: HTTP {}", transcriptId, response.getStatusCode());
            return null;
        } catch (Exception e) {
            log.error("Error fetching transcript text for {}", transcriptId, e);
            return null;
        }
    }
}
