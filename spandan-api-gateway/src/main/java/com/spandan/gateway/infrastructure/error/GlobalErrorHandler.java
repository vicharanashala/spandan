package com.spandan.gateway.infrastructure.error;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@Order(-1)
public class GlobalErrorHandler implements ErrorWebExceptionHandler {

    private final ObjectMapper objectMapper;

    public GlobalErrorHandler() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        ServerHttpResponse response = exchange.getResponse();
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        HttpStatus status;
        String error;
        String message;

        if (ex instanceof ResponseStatusException rse) {
            status = HttpStatus.resolve(rse.getStatusCode().value());
            if (status == null) status = HttpStatus.INTERNAL_SERVER_ERROR;
            error = switch (status) {
                case UNAUTHORIZED -> "unauthorized";
                case FORBIDDEN -> "forbidden";
                case TOO_MANY_REQUESTS -> "rate_limit_exceeded";
                case NOT_FOUND -> "not_found";
                case BAD_REQUEST -> "bad_request";
                case BAD_GATEWAY -> "bad_gateway";
                case SERVICE_UNAVAILABLE -> "service_unavailable";
                case GATEWAY_TIMEOUT -> "gateway_timeout";
                default -> "internal_error";
            };
            message = rse.getReason() != null ? rse.getReason() : status.getReasonPhrase();
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            error = "internal_error";
            message = "An unexpected error occurred";
        }

        String correlationId = exchange.getAttributeOrDefault("correlation_id", "unknown");
        String path = exchange.getRequest().getURI().getPath();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        body.put("message", message);
        body.put("status", status.value());
        body.put("timestamp", Instant.now().toString());
        body.put("path", path);
        body.put("correlation_id", correlationId);

        response.setStatusCode(status);

        byte[] bytes;
        try {
            bytes = objectMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
        } catch (JsonProcessingException e) {
            bytes = ("{\"error\":\"internal_error\",\"message\":\"Error serializing response\",\"status\":500}")
                    .getBytes(StandardCharsets.UTF_8);
        }

        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }

}
