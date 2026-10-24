FROM eclipse-temurin:21-jre-alpine AS base
RUN addgroup -S gateway && adduser -S gateway -G gateway

FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

FROM base
WORKDIR /app
COPY --from=build /build/target/spandan-api-gateway-*.jar app.jar
USER gateway
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
