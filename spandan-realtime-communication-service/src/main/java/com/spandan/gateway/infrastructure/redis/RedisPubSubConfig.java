package com.spandan.gateway.infrastructure.redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spandan.gateway.application.port.CrossPodMessagePublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class RedisPubSubConfig {

    @Bean
    public CrossPodMessagePublisher crossPodMessagePublisher(StringRedisTemplate redisTemplate) {
        return (channel, message) -> redisTemplate.convertAndSend(channel, message);
    }

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory,
            MessageListenerAdapter crossPodListenerAdapter) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(crossPodListenerAdapter, ChannelTopic.of("quiz:*"));
        container.addMessageListener(crossPodListenerAdapter, ChannelTopic.of("notification:*"));
        container.setExecutor(Executors.newFixedThreadPool(4));
        return container;
    }

    @Bean
    public MessageListenerAdapter crossPodListenerAdapter(CrossPodMessageListener listener) {
        return new MessageListenerAdapter(listener, "onMessage");
    }
}
