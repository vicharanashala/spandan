package com.spandan.recording.infrastructure.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.support.converter.RecordMessageConverter;
import org.springframework.kafka.support.converter.StringJsonMessageConverter;

@Configuration
public class KafkaConfig {

    @Value("${kafka.topics.audio-stream-events:audio-stream-events}")
    private String audioStreamEventsTopic;

    @Bean
    public NewTopic audioStreamEventsTopic() {
        return TopicBuilder.name(audioStreamEventsTopic)
                .partitions(3)
                .replicas(2)
                .build();
    }

    @Bean
    public RecordMessageConverter jsonMessageConverter() {
        return new StringJsonMessageConverter();
    }
}
