package com.spandan.gateway.infrastructure.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;

/**
 * Per-request structured log line. Runs after {@link CorrelationIdFilter} and after
 * {@code JwtAuthenticationFilter} so the resolved user id and role are visible.
 *
 * <p>Logs ONE line per request in the form:
 * <pre>{@code
 * method=POST path=/api/v1/polls status=201 duration_ms=12 correlation_id=req-... user_id=u123 role=STUDENT
 * }</pre>
 */
@Component
@Order(1000)
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger("gateway.access");

    @Override
    public int getOrder() {
        return 1000;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long startNs = System.nanoTime();
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        HttpMethod method = request.getMethod();
        String clientIp = clientIp(request);
        String query = request.getURI().getQuery();
        String queryFragment = query == null ? "" : "?" + query;

        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            long durationMs = (System.nanoTime() - startNs) / 1_000_000L;
            ServerHttpResponse response = exchange.getResponse();
            int status = response.getStatusCode() == null ? 0 : response.getStatusCode().value();
            String correlationId = ServerWebExchangeAttributes.correlationId(exchange);
            String userId = ServerWebExchangeAttributes.userId(exchange);
            String role = ServerWebExchangeAttributes.role(exchange) == null
                    ? "-" : ServerWebExchangeAttributes.role(exchange).name();

            log.info("method={} path={}{} status={} duration_ms={} correlation_id={} "
                            + "user_id={} role={} client_ip={} bytes_sent={}",
                    method, path, queryFragment, status, durationMs, correlationId,
                    userId, role, clientIp, "0");
        }));
    }

    private String clientIp(ServerHttpRequest request) {
        InetSocketAddress remote = request.getRemoteAddress();
        return remote == null ? "-" : remote.getAddress().getHostAddress();
    }
}
