package com.spandan.questiongen;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class QuestionGenerationApplication {

    public static void main(String[] args) {
        SpringApplication.run(QuestionGenerationApplication.class, args);
    }
}
