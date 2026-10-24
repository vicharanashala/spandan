package com.spandan.gateway.infrastructure.security;

/**
 * Recognized application roles emitted by Auth Service as the {@code role} JWT claim.
 *
 * <p>The Gateway treats role recognition as <strong>enumerative</strong>: a token whose role claim
 * is not one of these values is rejected with {@code 401 unauthorized}. This is intentional —
 * ADMIN, TEACHER, STUDENT are first-class role strings; anything else (e.g., SUPERADMIN, GUEST) is
 * rejected exactly as in v1.0.
 */
public enum Role {
    ADMIN,
    TEACHER,
    STUDENT;

    /**
     * Parse a role claim string into the enum. Returns {@code null} if the role is not recognized.
     *
     * <p>Recognized values: {@code ADMIN}, {@code TEACHER}, {@code STUDENT}.
     */
    public static Role fromClaim(String claim) {
        if (claim == null) {
            return null;
        }
        try {
            return Role.valueOf(claim.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}