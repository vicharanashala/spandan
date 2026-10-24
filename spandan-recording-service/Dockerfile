FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S spandan && adduser -S spandan -G spandan

WORKDIR /app

COPY target/recording-service-*.jar app.jar

RUN chown -R spandan:spandan /app

USER spandan

EXPOSE 8088

ENV JAVA_OPTS="-XX:+UseZGC -XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
