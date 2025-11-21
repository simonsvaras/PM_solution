package czm.pm_solution_be.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;

public class SecretsPropertySourceEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final Logger log = LoggerFactory.getLogger(SecretsPropertySourceEnvironmentPostProcessor.class);

    private static final String DB_PASSWORD_KEY = "DB_PASSWORD";
    private static final String GITLAB_TOKEN_KEY = "GITLAB_TOKEN";

    private static final Path DB_PASSWORD_PATH = Path.of("/run/secrets/czm-prod-projekty_project-pulse_postgres-password");
    private static final Path GITLAB_TOKEN_PATH = Path.of("/run/secrets/czm-prod-projekty_project-pulse_gitlab-ro-access-token");

    private static final String PROPERTY_SOURCE_NAME = "secretsPropertySource";

    private final List<SecretDescriptor> secretDescriptors;

    public SecretsPropertySourceEnvironmentPostProcessor() {
        this(defaultSecretDescriptors());
    }

    SecretsPropertySourceEnvironmentPostProcessor(List<SecretDescriptor> secretDescriptors) {
        this.secretDescriptors = secretDescriptors;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, org.springframework.boot.SpringApplication application) {
        Map<String, Object> secrets = new HashMap<>();

        for (SecretDescriptor descriptor : secretDescriptors) {
            addSecretIfPresent(secrets, descriptor.key(), descriptor.path());
        }

        if (!secrets.isEmpty()) {
            PropertySource<Map<String, Object>> propertySource = new MapPropertySource(PROPERTY_SOURCE_NAME, secrets);
            environment.getPropertySources().addFirst(propertySource);
            log.info("Loaded secrets property source with keys: {}", secrets.keySet());
        } else {
            log.info(
                    "No secrets found to load from {} or {}. Falling back to existing property sources (env vars, .env, application.yml)",
                    DB_PASSWORD_PATH,
                    GITLAB_TOKEN_PATH);
        }
    }

    private void addSecretIfPresent(Map<String, Object> target, String key, Path path) {
        if (Files.isReadable(path)) {
            try {
                String value = Files.readString(path).trim();
                if (!value.isEmpty()) {
                    target.put(key, value);
                }
            } catch (IOException exception) {
                log.warn("Failed to read secret from {}", path, exception);
            }
        }
    }

    private static List<SecretDescriptor> defaultSecretDescriptors() {
        return List.of(
                new SecretDescriptor(DB_PASSWORD_KEY, DB_PASSWORD_PATH),
                new SecretDescriptor(GITLAB_TOKEN_KEY, GITLAB_TOKEN_PATH));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    record SecretDescriptor(String key, Path path) {}
}
