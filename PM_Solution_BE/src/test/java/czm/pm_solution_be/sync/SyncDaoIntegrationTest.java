package czm.pm_solution_be.sync;

import czm.pm_solution_be.intern.InternDao;
import czm.pm_solution_be.intern.InternDao.InternRow;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SyncDaoIntegrationTest {

    @Test
    void insertReportsUsesHistoricalHourlyRate() {
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
            SyncDao syncDao = new SyncDao(jdbcTemplate);
            InternDao internDao = new InternDao(jdbcTemplate);

            long repositoryId = insertRepository(jdbcTemplate);
            long juniorLevelId = insertLevel(jdbcTemplate, "junior", BigDecimal.valueOf(160));
            long mediorLevelId = insertLevel(jdbcTemplate, "medior", BigDecimal.valueOf(180));

            InternRow intern = internDao.insert("Sara", "Rasim", uniqueUsername(), juniorLevelId);
            deleteExistingHistory(jdbcTemplate, intern.id());
            insertLevelHistory(jdbcTemplate, intern.id(), juniorLevelId,
                    LocalDate.of(2024, 3, 1), LocalDate.of(2025, 7, 13));
            insertLevelHistory(jdbcTemplate, intern.id(), mediorLevelId,
                    LocalDate.of(2025, 7, 14), null);

            BigDecimal oneHour = BigDecimal.ONE.setScale(4, RoundingMode.UNNECESSARY);
            List<SyncDao.ReportRow> rows = List.of(
                    new SyncDao.ReportRow(
                            repositoryId,
                            101L,
                            OffsetDateTime.parse("2025-06-01T10:00:00Z"),
                            3600,
                            oneHour,
                            intern.username(),
                            null),
                    new SyncDao.ReportRow(
                            repositoryId,
                            101L,
                            OffsetDateTime.parse("2025-08-01T10:00:00Z"),
                            3600,
                            oneHour,
                            intern.username(),
                            null)
            );

            SyncDao.ReportInsertStats stats = syncDao.insertReports(rows);
            assertThat(stats.inserted()).isEqualTo(2);

            List<Map<String, Object>> stored = jdbcTemplate.queryForList(
                    "SELECT spent_at, cost, hourly_rate_czk FROM report ORDER BY spent_at ASC");
            assertThat(stored).hasSize(2);
            assertThat(((OffsetDateTime) stored.get(0).get("spent_at")).toLocalDate())
                    .isEqualTo(LocalDate.of(2025, 6, 1));
            assertThat(((BigDecimal) stored.get(0).get("cost"))).isEqualByComparingTo("160.00");
            assertThat(((BigDecimal) stored.get(0).get("hourly_rate_czk"))).isEqualByComparingTo("160.00");
            assertThat(((OffsetDateTime) stored.get(1).get("spent_at")).toLocalDate())
                    .isEqualTo(LocalDate.of(2025, 8, 1));
            assertThat(((BigDecimal) stored.get(1).get("cost"))).isEqualByComparingTo("180.00");
            assertThat(((BigDecimal) stored.get(1).get("hourly_rate_czk"))).isEqualByComparingTo("180.00");
        }
    }

    @Test
    void insertReportsPrefersProjectHourlyRateWhenAvailable() {
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
            SyncDao syncDao = new SyncDao(jdbcTemplate);
            InternDao internDao = new InternDao(jdbcTemplate);

            long repositoryId = insertRepository(jdbcTemplate);
            long levelId = insertLevel(jdbcTemplate, "junior", BigDecimal.valueOf(160));

            InternRow intern = internDao.insert("Leo", "Ortiz", uniqueUsername(), levelId);
            deleteExistingHistory(jdbcTemplate, intern.id());
            insertLevelHistory(jdbcTemplate, intern.id(), levelId,
                    LocalDate.of(2024, 1, 1), null);

            BigDecimal oneHour = BigDecimal.ONE.setScale(4, RoundingMode.UNNECESSARY);
            BigDecimal projectRate = BigDecimal.valueOf(250);
            Long projectId = syncDao.createProjectByName("Projekt-" + UUID.randomUUID(), null, null, null, null, null, true, projectRate);
            syncDao.linkProjectRepository(projectId, repositoryId);

            SyncDao.ReportInsertStats stats = syncDao.insertReports(List.of(
                    new SyncDao.ReportRow(
                            repositoryId,
                            404L,
                            OffsetDateTime.parse("2025-09-01T10:00:00Z"),
                            3600,
                            oneHour,
                            intern.username(),
                            projectRate)
            ));

            assertThat(stats.inserted()).isEqualTo(1);

            Map<String, Object> stored = jdbcTemplate.queryForMap(
                    "SELECT cost, hourly_rate_czk FROM report WHERE repository_id = ?",
                    repositoryId);
            assertThat(((BigDecimal) stored.get("cost"))).isEqualByComparingTo("250.00");
            assertThat(((BigDecimal) stored.get("hourly_rate_czk"))).isEqualByComparingTo("160.00");

            BigDecimal cachedTotal = jdbcTemplate.queryForObject(
                    "SELECT reported_cost FROM project WHERE id = ?",
                    BigDecimal.class,
                    projectId);
            assertThat(cachedTotal).isEqualByComparingTo("250.00");
        }
    }

    @Test
    void createProjectByNameRejectsHourlyRateForInternalProject() {
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
            SyncDao syncDao = new SyncDao(jdbcTemplate);

            assertThatThrownBy(() -> syncDao.createProjectByName(
                    "Internal-" + UUID.randomUUID(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    false,
                    BigDecimal.valueOf(123)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Test
    void insertReportsStoresUnregisteredUsernameWithoutCost() {
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
            SyncDao syncDao = new SyncDao(jdbcTemplate);

            long repositoryId = insertRepository(jdbcTemplate);

            SyncDao.ReportInsertStats stats = syncDao.insertReports(List.of(
                    new SyncDao.ReportRow(
                            repositoryId,
                            101L,
                            OffsetDateTime.parse("2025-06-01T10:00:00Z"),
                            1800,
                            BigDecimal.valueOf(0.5).setScale(4, RoundingMode.UNNECESSARY),
                            "ghost-user",
                            null)
            ));

            assertThat(stats.inserted()).isEqualTo(1);
            assertThat(stats.duplicates()).isZero();
            assertThat(stats.failed()).isZero();
            assertThat(stats.missingUsernames()).containsExactly("ghost-user");

            Map<String, Object> row = jdbcTemplate.queryForMap("SELECT username, unregistered_username, cost, hourly_rate_czk FROM report");
            assertThat(row.get("username")).isNull();
            assertThat(row.get("unregistered_username")).isEqualTo("ghost-user");
            assertThat(row.get("cost")).isNull();
            assertThat(row.get("hourly_rate_czk")).isNull();
        }
    }

    @Test
    void recomputeReportCostsForInternUsesHistoricalRates() {
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
            SyncDao syncDao = new SyncDao(jdbcTemplate);
            InternDao internDao = new InternDao(jdbcTemplate);

            long repositoryId = insertRepository(jdbcTemplate);
            long juniorLevelId = insertLevel(jdbcTemplate, "junior", BigDecimal.valueOf(160));
            long mediorLevelId = insertLevel(jdbcTemplate, "medior", BigDecimal.valueOf(180));

            InternRow intern = internDao.insert("Sara", "Rasim", uniqueUsername(), juniorLevelId);
            deleteExistingHistory(jdbcTemplate, intern.id());
            insertLevelHistory(jdbcTemplate, intern.id(), juniorLevelId,
                    LocalDate.of(2024, 3, 1), null);

            BigDecimal oneHour = BigDecimal.ONE.setScale(4, RoundingMode.UNNECESSARY);
            SyncDao.ReportInsertStats stats = syncDao.insertReports(List.of(
                    new SyncDao.ReportRow(
                            repositoryId,
                            101L,
                            OffsetDateTime.parse("2025-08-01T10:00:00Z"),
                            3600,
                            oneHour,
                            intern.username(),
                            null)
            ));
            assertThat(stats.inserted()).isEqualTo(1);

            Map<String, Object> initial = jdbcTemplate.queryForMap(
                    "SELECT cost, hourly_rate_czk FROM report WHERE username = ?",
                    intern.username());
            assertThat(((BigDecimal) initial.get("cost"))).isEqualByComparingTo("160.00");
            assertThat(((BigDecimal) initial.get("hourly_rate_czk"))).isEqualByComparingTo("160.00");

            jdbcTemplate.update(
                    "UPDATE intern_level_history SET valid_to = ? WHERE intern_id = ? AND valid_to IS NULL",
                    LocalDate.of(2025, 7, 13),
                    intern.id());
            insertLevelHistory(jdbcTemplate, intern.id(), mediorLevelId,
                    LocalDate.of(2025, 7, 14), null);
            jdbcTemplate.update("UPDATE intern SET level_id = ? WHERE id = ?", mediorLevelId, intern.id());

            int recalculated = syncDao.recomputeReportCostsForIntern(intern.id());
            assertThat(recalculated).isEqualTo(1);

            Map<String, Object> recomputed = jdbcTemplate.queryForMap(
                    "SELECT cost, hourly_rate_czk FROM report WHERE username = ?",
                    intern.username());
            assertThat(((BigDecimal) recomputed.get("cost"))).isEqualByComparingTo("180.00");
            assertThat(((BigDecimal) recomputed.get("hourly_rate_czk"))).isEqualByComparingTo("180.00");
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

    private static long insertLevel(JdbcTemplate jdbcTemplate, String code, BigDecimal rate) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO level (code, label, hourly_rate_czk) VALUES (?,?,?) RETURNING id",
                Long.class,
                code + "-" + UUID.randomUUID(),
                "Level " + code,
                rate);
    }

    private static void insertLevelHistory(JdbcTemplate jdbcTemplate, long internId, long levelId,
                                           LocalDate validFrom, LocalDate validTo) {
        jdbcTemplate.update(con -> {
            var ps = con.prepareStatement(
                    "INSERT INTO intern_level_history (intern_id, level_id, valid_from, valid_to) VALUES (?, ?, ?, ?)");
            ps.setLong(1, internId);
            ps.setLong(2, levelId);
            ps.setObject(3, validFrom);
            if (validTo == null) {
                ps.setNull(4, Types.DATE);
            } else {
                ps.setObject(4, validTo);
            }
            return ps;
        });
    }

    private static void deleteExistingHistory(JdbcTemplate jdbcTemplate, long internId) {
        jdbcTemplate.update("DELETE FROM intern_level_history WHERE intern_id = ?", internId);
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

