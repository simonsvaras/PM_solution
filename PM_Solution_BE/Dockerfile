## Build stage
FROM gradle:8.9.0-jdk21 AS build
WORKDIR /app
COPY PM_Solution_BE/ /app/
RUN gradle clean bootJar -x test --no-daemon

# Wrapper
RUN chmod +x ./gradlew
RUN ./gradlew clean bootJar -x test --no-daemon

## Runtime stage
FROM eclipse-temurin:21-jre
ENV JAVA_OPTS=""
WORKDIR /app
COPY --from=build /app/build/libs/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/app.jar"]

