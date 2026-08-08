package com.spandan.gateway.infrastructure.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicEndpointPredicateTest {

    private final PublicEndpointPredicate predicate = new PublicEndpointPredicate();

    @Test
    void healthIsPublic() {
        assertTrue(predicate.isPublic(HttpMethod.GET, "/health"));
        assertTrue(predicate.isPublic(HttpMethod.GET, "/actuator"));
        assertTrue(predicate.isPublic(HttpMethod.GET, "/actuator/health"));
    }

    @Test
    void authBootstrapIsPublic() {
        assertTrue(predicate.isPublic(HttpMethod.POST, "/api/v1/auth/login"));
        assertTrue(predicate.isPublic(HttpMethod.POST, "/api/v1/auth/register"));
        assertTrue(predicate.isPublic(HttpMethod.POST, "/api/v1/auth/refresh"));
    }

    @Test
    void apiV1RoutesAreNotPublic() {
        assertFalse(predicate.isPublic(HttpMethod.GET, "/api/v1/polls"));
        assertFalse(predicate.isPublic(HttpMethod.POST, "/api/v1/polls"));
        assertFalse(predicate.isPublic(HttpMethod.GET, "/api/v1/admin"));
    }

    @Test
    void adminRouteIsNeverPublicEvenForGet() {
        // Admin is NEVER public; only ADMIN-role tokens can reach it.
        assertFalse(predicate.isPublic(HttpMethod.GET, "/api/v1/admin"));
        assertFalse(predicate.isPublic(HttpMethod.GET, "/api/v1/admin/users"));
    }
}