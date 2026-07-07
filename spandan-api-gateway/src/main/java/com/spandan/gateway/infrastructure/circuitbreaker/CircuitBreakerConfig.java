package com.spandan.gateway.infrastructure.circuitbreaker;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig.SlidingWindowType;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.timelimiter.TimeLimiterRegistry;
import org.springframework.cloud.circuitbreaker.resilience4j.ReactiveResilience4JCircuitBreakerFactory;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JConfigBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Resilience4j circuit breaker configuration. One breaker per route id declared in
 * {@code application.yml} ({@code pollingServiceCB}, {@code analyticsServiceCB}, …).
 *
 * <p>Per-route config is intentionally identical — they all need the same failure tolerance
 * because they share the same SLA. The fallback URI {@code /fallback/service_unavailable}
 * is wired by route YAML.
 */
@Configuration
public class CircuitBreakerConfig {

    /** Names that should be auto-created with our config the first time they're used. */
    public static final String[] KNOWN_BREAKERS = {
            "pollingServiceCB",
            "analyticsServiceCB",
            "transcriptionServiceCB",
            "questionGenerationServiceCB",
            "questionReviewServiceCB",
            "recordingServiceCB",
            "responseServiceCB",
            "reportingServiceCB",
            "adminServiceCB",
            "usersServiceCB"
    };

    @Bean
    public ReactiveResilience4JCircuitBreakerFactory reactiveCircuitBreakerFactory(
            CircuitBreakerRegistry circuitBreakerRegistry,
            TimeLimiterRegistry timeLimiterRegistry) {

        // Custom default configuration used for ALL breakers in this gateway.
        io.github.resilience4j.circuitbreaker.CircuitBreakerConfig defaultCfg =
                io.github.resilience4j.circuitbreaker.CircuitBreakerConfig.custom()
                        .slidingWindowType(SlidingWindowType.COUNT_BASED)
                        .slidingWindowSize(20)
                        .minimumNumberOfCalls(10)
                        .failureRateThreshold(50f)        // 50% failures opens the breaker
                        .waitDurationInOpenState(Duration.ofSeconds(10))
                        .permittedNumberOfCallsInHalfOpenState(5)
                        .slowCallDurationThreshold(Duration.ofSeconds(5))
                        .slowCallRateThreshold(50f)
                        .automaticTransitionFromOpenToHalfOpenEnabled(true)
                        .build();

        ReactiveResilience4JCircuitBreakerFactory factory =
                new ReactiveResilience4JCircuitBreakerFactory(circuitBreakerRegistry,
                        timeLimiterRegistry);

        factory.configureDefault(id -> new Resilience4JConfigBuilder(id)
                .circuitBreakerConfig(defaultCfg)
                .build());

        // Pre-register known breakers so they appear in actuator/metrics from t=0.
        for (String name : KNOWN_BREAKERS) {
            circuitBreakerRegistry.circuitBreaker(name, defaultCfg);
        }

        return factory;
    }
}