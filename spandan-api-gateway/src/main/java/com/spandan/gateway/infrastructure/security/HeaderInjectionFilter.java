package com.spandan.gateway.infrastructure.security;

import com.spandan.gateway.infrastructure.logging.ServerWebExchangeAttributes;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Header injection filter. Runs LAST among security filters (after
 * {@link JwtAuthenticationFilter} and {@link RoleAuthorizationFilter}) so the role is resolved.
 *
 * <p>Adds the following headers to the OUTBOUND request before forwarding to the upstream service:
 * <ul>
 *   <li>{@code X-User-Id} – the authenticated user's id</li>
 *   <li>{@code X-Role} – the authenticated role (ADMIN, TEACHER, STUDENT)</li>
 *   <li>{@code X-Correlation-Id} – echoed for downstream tracing</li>
 * </ul>
 *
 * <p>This is the addendum from context-admin-role.md: services downstream of the gateway can
 * rely on {@code X-Role: ADMIN} being present on every request authorized by the gateway.
 */
@Component
@Order(500)
public class HeaderInjectionFilter implements GlobalFilter, Ordered {

    @Override
    public int getOrder() {
        return 500;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        Role role = ServerWebExchangeAttributes.role(exchange);
        String userId = ServerWebExchangeAttributes.userId(exchange);
        String correlationId = ServerWebExchangeAttributes.correlationId(exchange);

        ServerHttpRequest mutated = exchange.getRequest().mutate()
                .header(GatewayHeaders.X_USER_ID, userId)
                .header(GatewayHeaders.X_ROLE, role == null ? "-" : role.name())
                .header(GatewayHeaders.X_CORRELATION_ID, correlationId)
                .build();

        return chain.filter(exchange.mutate().request(mutated).build());
    }
}