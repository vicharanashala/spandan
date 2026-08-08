package com.spandan.gateway.infrastructure.error;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * Serializes an {@link ErrorEnvelope} into the response body. Used by every GlobalFilter that
 * short-circuits the gateway chain (auth failures, role failures, rate-limit failures).
 */
@Component
public class ErrorResponseWriter {

    private final ObjectMapper objectMapper;

    public ErrorResponseWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Write a JSON error envelope. Returns a completed Mono so the caller can chain {@code .then()}
     * to short-circuit downstream filters.
     */
    public Mono<Void> write(ServerHttpResponse response, HttpStatus status, ErrorEnvelope envelope) {
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            byte[] body = objectMapper.writeValueAsBytes(envelope);
            DataBuffer buffer = response.bufferFactory().wrap(body);
            return response.writeWith(Mono.just(buffer));
        } catch (JsonProcessingException ex) {
            byte[] body = ("{\"error\":\"internal_error\","
                    + "\"message\":\"Unable to serialize error\","
                    + "\"status\":500}").getBytes(StandardCharsets.UTF_8);
            DataBuffer buffer = response.bufferFactory().wrap(body);
            return response.writeWith(Mono.just(buffer));
        }
    }
}