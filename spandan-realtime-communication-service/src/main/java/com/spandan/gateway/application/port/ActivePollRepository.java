package com.spandan.gateway.application.port;

import com.spandan.gateway.domain.entity.ActivePoll;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ActivePollRepository {

    void save(ActivePoll poll);

    Optional<ActivePoll> findBySessionId(String sessionId);

    void deleteBySessionId(String sessionId);

    List<ActivePoll> findAllActive();
}
