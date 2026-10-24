package com.spandan.transcription.infrastructure.config;

import com.spandan.transcription.infrastructure.grpc.TranscriptIngestionService;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;

@Configuration
public class GrpcConfig {

    private static final Logger log = LoggerFactory.getLogger(GrpcConfig.class);

    @Value("${grpc.server.port:50052}")
    private int port;

    @Bean(destroyMethod = "shutdown")
    public Server grpcServer(TranscriptIngestionService ingestionService) throws IOException {
        Server server = ServerBuilder.forPort(port)
                .addService(ingestionService)
                .build()
                .start();
        log.info("gRPC server started on port {}", port);
        return server;
    }
}
