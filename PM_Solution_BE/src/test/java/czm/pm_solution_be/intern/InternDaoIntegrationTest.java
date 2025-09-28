package czm.pm_solution_be.intern;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class InternDaoIntegrationTest {

    @Test
    void deletingInternKeepsReportRowAndNullsUsername() {
        Assumptions.assumeTrue(isDockerAvailable(), "Docker is required for the integration test");

        DockerImageName image = DockerImageName.parse("postgres:16-alpine").asCompatibleSubstituteFor("postgres");
        try (PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(image)) {
            postgres.start();

            Flyway.configure()
                    .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                    .locations("classpath:db/migration")
                    .load()
                    .migrate();

            DriverManagerDataSource dataSource = new DriverManagerDataSource();
            dataSource.setDriverClassName("org.postgresql.Driver");
            dataSource.setUrl(postgres.getJdbcUrl());
            dataSource.setUsername(postgres.getUsername());
            dataSource.setPassword(postgres.getPassword());

            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            InternDao internDao = new InternDao(jdbcTemplate);

            long levelId = insertLevel(jdbcTemplate, "lvl-" + UUID.randomUUID());
            InternDao.InternRow primaryIntern = internDao.insert("Alice", "Tester", uniqueUsername(), levelId);
            InternDao.InternRow secondaryIntern = internDao.insert("Bob", "Reviewer", uniqueUsername(), levelId);

            long repositoryId = insertRepository(jdbcTemplate);
            BigDecimal hours = BigDecimal.valueOf(2).setScale(4);
            BigDecimal hourlyRate = BigDecimal.valueOf(100);
            BigDecimal cost = hours.multiply(hourlyRate).setScale(2, RoundingMode.HALF_UP);
            Long reportId = jdbcTemplate.queryForObject(
                    "INSERT INTO report (repository_id, iid, spent_at, time_spent_seconds, time_spent_hours, username, cost) VALUES (?,?,?,?,?,?,?) RETURNING id",
                    Long.class,
                    repositoryId,
                    42L,
                    OffsetDateTime.now(),
                    7200,
                    hours,
                    primaryIntern.username(),
                    cost);

            assertThat(reportId).isNotNull();

            int deleted = internDao.delete(primaryIntern.id());
            assertThat(deleted).isEqualTo(1);

            String username = jdbcTemplate.queryForObject("SELECT username FROM report WHERE id = ?", String.class, reportId);
            assertThat(username).isNull();

            Integer reportCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM report", Integer.class);
            assertThat(reportCount).isEqualTo(1);

            Map<String, Object> summary = jdbcTemplate.queryForMap(
                    "SELECT seconds_spent_total, hours_spent_total FROM intern_time_summary WHERE intern_id = ?",
                    secondaryIntern.id());
            assertThat(summary).isNotNull();
            assertThat(((Number) summary.get("seconds_spent_total")).longValue()).isZero();
            assertThat(((BigDecimal) summary.get("hours_spent_total")).compareTo(BigDecimal.ZERO)).isZero();
        }
    }

    private static boolean isDockerAvailable() {
        try {
            DockerClientFactory.instance().client();
            return true;
        } catch (Throwable ex) {
            return false;
        }
    }

    private static long insertLevel(JdbcTemplate jdbcTemplate, String code) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO level (code, label, hourly_rate_czk) VALUES (?,?,?) RETURNING id",
                Long.class,
                code,
                "Level " + code,
                BigDecimal.valueOf(100));
    }

    private static long insertRepository(JdbcTemplate jdbcTemplate) {
        long raw = UUID.randomUUID().getMostSignificantBits();
        long gitlabRepoId = raw == Long.MIN_VALUE ? 1L : Math.abs(raw);
        return jdbcTemplate.queryForObject(
                "INSERT INTO repository (gitlab_repo_id, name, name_with_namespace, root_repo) VALUES (?,?,?,?) RETURNING id",
                Long.class,
                gitlabRepoId == 0 ? 1L : gitlabRepoId,
                "Repo",
                "Group/Repo",
                false);
    }

    private static String uniqueUsername() {
        return "user_" + UUID.randomUUID().toString().replace("-", "");
    }
}
