package com.spandan.gateway.infrastructure.logging;

import com.spandan.gateway.infrastructure.security.GatewayHeaders;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Correlation id filter. Runs FIRST in the gateway chain.
 *
 * <p>Behavior:
 * <ul>
 *   <li>If the client supplies a non-blank {@code X-Correlation-Id}, accept it verbatim.</li>
 *   <li>Otherwise generate a new correlation id of the form {@code req-<32-hex>}.</li>
 *   <li>Store the value on the exchange AND on the request so downstream services see it.</li>
 *   <li>Echo it back in the response as {@code X-Correlation-Id}.</li>
 * </ul>
 *
 * <p>This filter is order 0; every other gateway filter depends on the correlation id existing.
 */
@Component
@Order(0)
public class CorrelationIdFilter implements GlobalFilter, Ordered {

    @Override
    public int getOrder() {
        return 0;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = exchange.getRequest().getHeaders().getFirst(GatewayHeaders.X_CORRELATION_ID);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = ServerWebExchangeAttributes.newCorrelationId();
        } else {
            // Trim & clamp to a sane length; clients can put anything in headers.
            correlationId = correlationId.trim();
            if (correlationId.length() > 128) {
                correlationId = correlationId.substring(0, 128);
            }
        }

        // Make the correlation id available to every other filter.
        exchange.getAttributes().put(ServerWebExchangeAttributes.CORRELATION_ID, correlationId);

        // Inject the correlation id on the OUTBOUND request to downstream services.
        final String finalCid = correlationId;
        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header(GatewayHeaders.X_CORRELATION_ID, finalCid)
                .build();
        ServerWebExchange mutatedExchange = exchange.mutate().request(mutated).build();

        // Echo it back on the response.
        mutatedExchange.getResponse().getHeaders().add(GatewayHeaders.X_CORRELATION_ID, finalCid);

        return chain.filter(mutatedExchange);
    }
}
