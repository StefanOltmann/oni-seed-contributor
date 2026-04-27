ARG BUILDPLATFORM
ARG TARGETPLATFORM

FROM --platform=$BUILDPLATFORM gradle:9-jdk25 AS build_stage
ARG MNI_API_KEY_DOCKER
WORKDIR /tmp
ENV MNI_API_KEY_DOCKER=$MNI_API_KEY_DOCKER
COPY .git .git
COPY gradle gradle
COPY build.gradle.kts gradle.properties settings.gradle.kts gradlew ./
COPY src src
RUN chmod +x gradlew
RUN ./gradlew --no-daemon --info test buildFatJar

FROM eclipse-temurin:25-jre
EXPOSE 8080
RUN mkdir /app
COPY --from=build_stage /tmp/build/libs/*-all.jar /app/ktor-server.jar
ENTRYPOINT ["java","-Xlog:gc+init","-XX:+PrintCommandLineFlags","-jar","/app/ktor-server.jar"]
