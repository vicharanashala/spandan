package com.spandan.polling.application.port;

import com.spandan.polling.infrastructure.kafka.PollingEvent;

public interface EventPublisher {
    void publish(PollingEvent event);
}
