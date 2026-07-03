package com.spandan.notification.infrastructure.persistence;

import com.spandan.notification.domain.entity.UserNotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserNotificationPreferenceRepository extends JpaRepository<UserNotificationPreference, UUID> {

    Optional<UserNotificationPreference> findByUserId(UUID userId);
}
