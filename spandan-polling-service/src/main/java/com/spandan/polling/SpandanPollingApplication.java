package com.spandan.polling;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SpandanPollingApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpandanPollingApplication.class, args);
    }
}
