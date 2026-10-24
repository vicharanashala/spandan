package com.spandan.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the Spandan API Gateway.
 *
 * <p>This is pure infrastructure. It owns no business state, contains no business logic,
 * and accesses no database. It is fully stateless and horizontally scalable.
 */
@SpringBootApplication
public class SpandanApiGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpandanApiGatewayApplication.class, args);
    }
}
