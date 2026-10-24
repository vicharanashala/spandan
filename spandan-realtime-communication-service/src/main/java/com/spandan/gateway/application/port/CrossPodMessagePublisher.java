package com.spandan.gateway.application.port;

public interface CrossPodMessagePublisher {
    void publish(String channel, String message);
}
