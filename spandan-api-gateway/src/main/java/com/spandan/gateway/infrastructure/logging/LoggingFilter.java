package com.spandan.gateway.infrastructure.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Instant;

@Component
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);

    @Override
    public int getOrder() {
        return 100;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String correlationId = exchange.getAttributeOrDefault("correlation_id", "unknown");
        String path = request.getURI().getPath();
        String method = request.getMethod().name();
        String clientIp = request.getRemoteAddress() != null ? request.getRemoteAddress().getAddress().getHostAddress() : "-";
        String userId = request.getHeaders().getFirst("X-User-Id");
        String role = request.getHeaders().getFirst("X-Role");
        long startTime = Instant.now().toEpochMilli();

        String maskedAuth = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (maskedAuth != null) {
            exchange = exchange.mutate()
                    .request(r -> r.header("Authorization", maskedAuth.startsWith("Bearer ") ? "Bearer ***" : "***"))
                    .build();
        }

        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            long duration = Instant.now().toEpochMilli() - startTime;
            int status = exchange.getResponse().getStatusCode() != null ? exchange.getResponse().getStatusCode().value() : 0;

            MDC.put("correlation_id", correlationId);
            log.info("method={} path={} status={} duration_ms={} user_id={} role={} client_ip={}",
                    method, path, status, duration, userId != null ? userId : "-", role != null ? role : "-", clientIp);
            MDC.clear();
        }));
    }

}
