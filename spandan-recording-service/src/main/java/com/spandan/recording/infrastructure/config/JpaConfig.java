package com.spandan.recording.infrastructure.config;

import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaRepositories(basePackages = "com.spandan.recording.infrastructure.persistence")
@EntityScan(basePackages = "com.spandan.recording.domain.entity")
public class JpaConfig {
}
