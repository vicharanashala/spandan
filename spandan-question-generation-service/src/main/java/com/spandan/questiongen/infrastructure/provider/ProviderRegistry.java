package com.spandan.questiongen.infrastructure.provider;

import com.spandan.questiongen.domain.exception.GenerationException;
import com.spandan.questiongen.domain.port.QuestionGenerationProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class ProviderRegistry {

    private static final Logger log = LoggerFactory.getLogger(ProviderRegistry.class);

    private final Map<String, QuestionGenerationProvider> providers;
    private final String primaryProvider;
    private final String fallbackProvider;

    public ProviderRegistry(List<QuestionGenerationProvider> providerList,
                            @Value("${question-generation.provider.primary:openai}") String primaryProvider,
                            @Value("${question-generation.provider.fallback:}") String fallbackProvider) {
        this.providers = providerList.stream()
            .collect(Collectors.toMap(QuestionGenerationProvider::name, Function.identity()));
        this.primaryProvider = primaryProvider;
        this.fallbackProvider = fallbackProvider;
        log.info("Registered providers: {}, primary: {}, fallback: {}", providers.keySet(), primaryProvider, fallbackProvider);
    }

    public QuestionGenerationProvider getPrimary() {
        return Optional.ofNullable(providers.get(primaryProvider))
            .orElseThrow(() -> GenerationException.serviceUnavailable("Primary provider " + primaryProvider + " not registered"));
    }

    public Optional<QuestionGenerationProvider> getFallback() {
        return fallbackProvider.isEmpty() ? Optional.empty() : Optional.ofNullable(providers.get(fallbackProvider));
    }

    public QuestionGenerationProvider getByName(String name) {
        return Optional.ofNullable(providers.get(name))
            .orElseThrow(() -> GenerationException.badRequest("Unknown provider: " + name));
    }
}
