package czm.pm_solution_be.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.env.MockEnvironment;

class SecretsPropertySourceEnvironmentPostProcessorTest {

    private static final String PROPERTY_SOURCE_NAME = "secretsPropertySource";

    @Test
    void loadsSecretsWhenFilesAreReadable(@TempDir Path tempDir) throws IOException {
        Path dbSecret = tempDir.resolve("db-secret");
        Path gitlabSecret = tempDir.resolve("gitlab-secret");
        Files.writeString(dbSecret, "db-password");
        Files.writeString(gitlabSecret, "gitlab-token");

        SecretsPropertySourceEnvironmentPostProcessor postProcessor =
                new SecretsPropertySourceEnvironmentPostProcessor(
                        List.of(
                                new SecretsPropertySourceEnvironmentPostProcessor.SecretDescriptor("DB_PASSWORD", dbSecret),
                                new SecretsPropertySourceEnvironmentPostProcessor.SecretDescriptor("GITLAB_TOKEN", gitlabSecret)));

        ConfigurableEnvironment environment = new MockEnvironment();

        postProcessor.postProcessEnvironment(environment, new SpringApplication(Object.class));

        assertThat(environment.getProperty(PROPERTY_SOURCE_NAME)).isNull();
        assertThat(environment.getProperty("DB_PASSWORD")).isEqualTo("db-password");
        assertThat(environment.getProperty("GITLAB_TOKEN")).isEqualTo("gitlab-token");
        assertThat(environment.getPropertySources().iterator().next().getName()).isEqualTo(PROPERTY_SOURCE_NAME);
    }

    @Test
    void fallsBackToExistingPropertiesWhenSecretsUnavailable(@TempDir Path tempDir) {
        Path dbSecret = tempDir.resolve("missing-db-secret");
        Path gitlabSecret = tempDir.resolve("missing-gitlab-secret");

        SecretsPropertySourceEnvironmentPostProcessor postProcessor =
                new SecretsPropertySourceEnvironmentPostProcessor(
                        List.of(
                                new SecretsPropertySourceEnvironmentPostProcessor.SecretDescriptor("DB_PASSWORD", dbSecret),
                                new SecretsPropertySourceEnvironmentPostProcessor.SecretDescriptor("GITLAB_TOKEN", gitlabSecret)));

        ConfigurableEnvironment environment = new MockEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("env", Map.of("DB_PASSWORD", "env-db", "GITLAB_TOKEN", "env-token")));

        postProcessor.postProcessEnvironment(environment, new SpringApplication(Object.class));

        assertThat(environment.getProperty("DB_PASSWORD")).isEqualTo("env-db");
        assertThat(environment.getProperty("GITLAB_TOKEN")).isEqualTo("env-token");
        assertThat(environment.getPropertySources().get(PROPERTY_SOURCE_NAME)).isNull();
    }
}
