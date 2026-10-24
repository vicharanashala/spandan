package com.spandan.gateway.infrastructure.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RoleTest {

    @Test
    void fromClaim_acceptsRecognizedRoles() {
        assertEquals(Role.ADMIN, Role.fromClaim("ADMIN"));
        assertEquals(Role.TEACHER, Role.fromClaim("TEACHER"));
        assertEquals(Role.STUDENT, Role.fromClaim("STUDENT"));
    }

    @Test
    void fromClaim_isCaseInsensitive() {
        assertEquals(Role.ADMIN, Role.fromClaim("admin"));
        assertEquals(Role.ADMIN, Role.fromClaim("Admin"));
        assertEquals(Role.ADMIN, Role.fromClaim("  ADMIN  "));
    }

    @Test
    void fromClaim_rejectsUnknownRoles() {
        assertNull(Role.fromClaim("SUPERADMIN"));
        assertNull(Role.fromClaim("GUEST"));
        assertNull(Role.fromClaim("root"));
    }

    @Test
    void fromClaim_rejectsNullAndBlank() {
        assertNull(Role.fromClaim(null));
        assertNull(Role.fromClaim(""));
        assertNull(Role.fromClaim("   "));
    }
}