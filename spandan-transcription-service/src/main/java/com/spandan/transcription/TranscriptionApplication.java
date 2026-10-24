package com.spandan.transcription;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TranscriptionApplication {

    public static void main(String[] args) {
        SpringApplication.run(TranscriptionApplication.class, args);
    }
}
