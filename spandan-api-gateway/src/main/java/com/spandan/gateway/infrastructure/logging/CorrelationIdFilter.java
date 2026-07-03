package com.spandan.gateway.infrastructure.logging;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
public class CorrelationIdFilter implements GlobalFilter, Ordered {

    private static final String CORRELATION_ID_HEADER = "X-Correlation-Id";

    @Override
    public int getOrder() {
        return -200;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = exchange.getRequest().getHeaders().getFirst(CORRELATION_ID_HEADER);

        if (correlationId == null || correlationId.isBlank()) {
            correlationId = "req-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        }

        exchange.getAttributes().put("correlation_id", correlationId);

        exchange = exchange.mutate()
                .request(r -> r.header(CORRELATION_ID_HEADER, correlationId))
                .response(response -> response.getHeaders().add(CORRELATION_ID_HEADER, correlationId))
                .build();

        return chain.filter(exchange);
    }

}
