package czm.pm_solution_be.intern;

import czm.pm_solution_be.sync.SyncDao;
import czm.pm_solution_be.sync.SyncDao.InternMonthlyHoursRow;
import czm.pm_solution_be.sync.SyncDao.ReportRow;
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
import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class InternMonthlyHoursIntegrationTest {

    @Test
    void listInternMonthlyHoursAggregatesAllInternsAndMonths() {
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
            BigDecimal projectRate = BigDecimal.valueOf(250).setScale(2, RoundingMode.UNNECESSARY);
            Long projectId = syncDao.createProjectByName(
                    "Project-" + UUID.randomUUID(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    true,
                    projectRate);
            syncDao.linkProjectRepository(projectId, repositoryId);

            long juniorLevelId = insertLevel(jdbcTemplate, "junior", BigDecimal.valueOf(160));
            long employeeLevelId = insertLevel(jdbcTemplate, "employee", BigDecimal.ZERO);

            InternDao.InternRow juniorIntern = internDao.insert("Alice", "Analyst", uniqueUsername(), juniorLevelId);
            InternDao.InternRow employeeIntern = internDao.insert("Bob", "Builder", uniqueUsername(), employeeLevelId);
            InternDao.InternRow idleIntern = internDao.insert("Cara", "Checker", uniqueUsername(), juniorLevelId);

            resetLevelHistory(jdbcTemplate, juniorIntern.id());
            resetLevelHistory(jdbcTemplate, employeeIntern.id());
            resetLevelHistory(jdbcTemplate, idleIntern.id());

            insertLevelHistory(jdbcTemplate, juniorIntern.id(), juniorLevelId, LocalDate.of(2024, 1, 1), null);
            insertLevelHistory(jdbcTemplate, employeeIntern.id(), employeeLevelId, LocalDate.of(2024, 1, 1), null);
            insertLevelHistory(jdbcTemplate, idleIntern.id(), juniorLevelId, LocalDate.of(2024, 1, 1), null);

            jdbcTemplate.update(
                    "INSERT INTO intern_project (intern_id, project_id, workload_hours, include_in_reported_cost) VALUES (?, ?, ?, ?)",
                    juniorIntern.id(), projectId, BigDecimal.valueOf(40), true);
            jdbcTemplate.update(
                    "INSERT INTO intern_project (intern_id, project_id, workload_hours, include_in_reported_cost) VALUES (?, ?, ?, ?)",
                    employeeIntern.id(), projectId, BigDecimal.valueOf(40), false);

            BigDecimal twoHours = BigDecimal.valueOf(2).setScale(4, RoundingMode.UNNECESSARY);
            BigDecimal fourHours = BigDecimal.valueOf(4).setScale(4, RoundingMode.UNNECESSARY);
            syncDao.insertReports(List.of(
                    new ReportRow(
                            repositoryId,
                            null,
                            OffsetDateTime.parse("2024-02-10T09:00:00Z"),
                            7200,
                            twoHours,
                            juniorIntern.username(),
                            projectRate),
                    new ReportRow(
                            repositoryId,
                            null,
                            OffsetDateTime.parse("2024-02-12T09:00:00Z"),
                            14400,
                            fourHours,
                            employeeIntern.username(),
                            projectRate),
                    new ReportRow(
                            repositoryId,
                            null,
                            OffsetDateTime.parse("2024-03-05T09:00:00Z"),
                            7200,
                            twoHours,
                            juniorIntern.username(),
                            projectRate)
            ));

            OffsetDateTime from = OffsetDateTime.parse("2024-02-01T00:00:00Z");
            OffsetDateTime to = OffsetDateTime.parse("2024-04-01T00:00:00Z");
            List<InternMonthlyHoursRow> rows = syncDao.listInternMonthlyHours(from, to);

            assertThat(rows).hasSize(6);

            Map<Long, List<InternMonthlyHoursRow>> rowsByIntern = rows.stream()
                    .collect(Collectors.groupingBy(InternMonthlyHoursRow::internId));
            assertThat(rowsByIntern.keySet())
                    .containsExactlyInAnyOrder(juniorIntern.id(), employeeIntern.id(), idleIntern.id());

            List<InternMonthlyHoursRow> juniorRows = rowsByIntern.get(juniorIntern.id());
            assertThat(juniorRows).extracting(row -> row.monthStart().toLocalDate())
                    .containsExactly(LocalDate.of(2024, 2, 1), LocalDate.of(2024, 3, 1));
            assertThat(juniorRows.get(0).hours()).isEqualByComparingTo(twoHours);
            assertThat(juniorRows.get(0).cost()).isEqualByComparingTo(projectRate.multiply(BigDecimal.valueOf(2)));
            assertThat(juniorRows.get(1).hours()).isEqualByComparingTo(twoHours);
            assertThat(juniorRows.get(1).cost()).isEqualByComparingTo(projectRate.multiply(BigDecimal.valueOf(2)));
            assertThat(juniorRows)
                    .allSatisfy(row -> {
                        assertThat(row.levelId()).isEqualTo(juniorLevelId);
                        assertThat(row.levelCode()).isEqualTo("junior");
                        assertThat(row.levelLabel()).isEqualTo("Level junior");
                    });

            List<InternMonthlyHoursRow> employeeRows = rowsByIntern.get(employeeIntern.id());
            assertThat(employeeRows).extracting(row -> row.monthStart().toLocalDate())
                    .containsExactly(LocalDate.of(2024, 2, 1), LocalDate.of(2024, 3, 1));
            assertThat(employeeRows.get(0).hours()).isEqualByComparingTo(fourHours);
            assertThat(employeeRows.get(0).cost()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(employeeRows.get(1).hours()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(employeeRows.get(1).cost()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(employeeRows)
                    .allSatisfy(row -> {
                        assertThat(row.levelId()).isEqualTo(employeeLevelId);
                        assertThat(row.levelCode()).isEqualTo("employee");
                        assertThat(row.levelLabel()).isEqualTo("Level employee");
                    });

            List<InternMonthlyHoursRow> idleRows = rowsByIntern.get(idleIntern.id());
            assertThat(idleRows).extracting(row -> row.monthStart().toLocalDate())
                    .containsExactly(LocalDate.of(2024, 2, 1), LocalDate.of(2024, 3, 1));
            assertThat(idleRows.get(0).hours()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(idleRows.get(1).hours()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(idleRows.get(0).cost()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(idleRows.get(1).cost()).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(idleRows)
                    .allSatisfy(row -> {
                        assertThat(row.levelId()).isEqualTo(juniorLevelId);
                        assertThat(row.levelCode()).isEqualTo("junior");
                        assertThat(row.levelLabel()).isEqualTo("Level junior");
                    });
        }
    }

    @Test
    void listInternMonthlyHoursIncludesReportsWithoutLinkedProject() {
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

            long juniorLevelId = insertLevel(jdbcTemplate, "junior", BigDecimal.valueOf(200));
            InternDao.InternRow intern = internDao.insert("Dora", "Developer", uniqueUsername(), juniorLevelId);
            resetLevelHistory(jdbcTemplate, intern.id());
            insertLevelHistory(jdbcTemplate, intern.id(), juniorLevelId, LocalDate.of(2023, 9, 1), null);

            BigDecimal loggedHours = BigDecimal.valueOf(5).setScale(4, RoundingMode.UNNECESSARY);
            BigDecimal projectRate = BigDecimal.valueOf(220).setScale(2, RoundingMode.UNNECESSARY);
            syncDao.insertReports(List.of(
                    new ReportRow(
                            repositoryId,
                            null,
                            OffsetDateTime.parse("2024-05-14T10:00:00Z"),
                            18000,
                            loggedHours,
                            intern.username(),
                            projectRate)
            ));

            OffsetDateTime from = OffsetDateTime.parse("2024-01-01T00:00:00Z");
            OffsetDateTime to = OffsetDateTime.parse("2025-01-01T00:00:00Z");
            List<InternMonthlyHoursRow> rows = syncDao.listInternMonthlyHours(from, to);

            Map<Long, List<InternMonthlyHoursRow>> rowsByIntern = rows.stream()
                    .collect(Collectors.groupingBy(InternMonthlyHoursRow::internId));
            assertThat(rowsByIntern).containsKey(intern.id());

            List<InternMonthlyHoursRow> internRows = rowsByIntern.get(intern.id());
            assertThat(internRows)
                    .extracting(row -> row.monthStart().toLocalDate())
                    .contains(LocalDate.of(2024, 5, 1));

            InternMonthlyHoursRow mayRow = internRows.stream()
                    .filter(row -> row.monthStart().toLocalDate().equals(LocalDate.of(2024, 5, 1)))
                    .findFirst()
                    .orElseThrow();
            assertThat(mayRow.hours()).isEqualByComparingTo(loggedHours);
            assertThat(mayRow.cost()).isEqualByComparingTo(projectRate.multiply(loggedHours).setScale(2, RoundingMode.HALF_UP));
            assertThat(mayRow.levelId()).isEqualTo(juniorLevelId);
            assertThat(mayRow.levelCode()).isEqualTo("junior");
            assertThat(mayRow.levelLabel()).isEqualTo("Level junior");
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
                code,
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

    private static void resetLevelHistory(JdbcTemplate jdbcTemplate, long internId) {
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
