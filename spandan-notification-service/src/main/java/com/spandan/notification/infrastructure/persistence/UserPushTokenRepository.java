package com.spandan.notification.infrastructure.persistence;

import com.spandan.notification.domain.entity.UserPushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserPushTokenRepository extends JpaRepository<UserPushToken, UUID> {

    List<UserPushToken> findByUserIdAndIsActiveTrue(UUID userId);

    Optional<UserPushToken> findByUserIdAndDeviceId(UUID userId, String deviceId);
}
