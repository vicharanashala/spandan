package com.spandan.gateway.infrastructure.error;

import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.cloud.gateway.support.NotFoundException;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Last-resort error handler for the gateway. Anything that throws an unhandled exception
 * inside the gateway chain ends up here and is shaped into the standard
 * {@link ErrorEnvelope} JSON.
 *
 * <p>The handler is intentionally permissive: it does NOT log request bodies (which can
 * contain credentials) but does log correlation id + path + cause class for forensics.
 */
@Component
@Order(-2)
public class GlobalErrorHandler implements ErrorWebExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalErrorHandler.class);

    private final ErrorResponseWriter errorWriter;

    public GlobalErrorHandler(ErrorResponseWriter errorWriter) {
        this.errorWriter = errorWriter;
    }

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        String path = exchange.getRequest().getURI().getPath();
        String correlationId = ServerWebExchangeAttributes.correlationId(exchange);

        HttpStatus status;
        String code;
        String message;

        if (ex instanceof NotFoundException) {
            status = HttpStatus.NOT_FOUND;
            code = "route_not_found";
            message = "No downstream route matched the request";
        } else if (ex instanceof org.springframework.web.server.ResponseStatusException rse) {
            status = HttpStatus.valueOf(rse.getStatusCode().value());
            code = "request_error";
            message = rse.getReason() == null ? status.getReasonPhrase() : rse.getReason();
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            code = "gateway_error";
            message = "An unexpected error occurred";
        }

        log.error("Unhandled gateway exception correlation_id={} path={} cause={}",
                correlationId, path, ex.getClass().getName(), ex);

        ErrorEnvelope envelope = ErrorEnvelope.of(code, message, status.value(), path, correlationId);
        return errorWriter.write(exchange.getResponse(), status, envelope);
    }

    /** Convenience for tests / other filters that need to write a server-side error directly. */
    public Mono<Void> writeDirect(ServerHttpResponse response, HttpStatus status, ErrorEnvelope envelope) {
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] body;
        try {
            body = new com.fasterxml.jackson.databind.ObjectMapper()
                    .writeValueAsBytes(envelope);
        } catch (Exception ex) {
            body = "{}".getBytes();
        }
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
    }
}