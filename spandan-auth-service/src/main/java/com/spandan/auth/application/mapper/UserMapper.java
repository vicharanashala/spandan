package com.spandan.auth.application.mapper;

import com.spandan.auth.domain.entity.User;
import com.spandan.auth.presentation.dto.response.UserProfileResponse;

public class UserMapper {

    public static UserProfileResponse toProfileResponse(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getRole().name(),
                user.getLastLoginAt()
        );
    }
}
