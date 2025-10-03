package czm.pm_solution_be.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ProjectReportDetailControllerIntegrationTest {

    private static final DockerImageName POSTGRES_IMAGE = DockerImageName
            .parse("postgres:16-alpine")
            .asCompatibleSubstituteFor("postgres");

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(POSTGRES_IMAGE);

    @DynamicPropertySource
    static void configureDatasource(DynamicPropertyRegistry registry) {
        if (!POSTGRES.isRunning()) {
            POSTGRES.start();
        }
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.flyway.locations", () -> "classpath:db/migration");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("TRUNCATE report, projects_to_repositorie, repository, intern_project, intern, project RESTART IDENTITY CASCADE");
    }

    @Test
    void longTermReportAggregatesMonthlyData() throws Exception {
        long projectId = insertProject("Projekt A", 1000, LocalDate.of(2024, 1, 1), LocalDate.of(2024, 3, 31), BigDecimal.valueOf(100));
        long repositoryId = insertRepository(10_001L, "Repo", "Group/Repo");
        linkProjectRepository(projectId, repositoryId);

        long aliceId = insertIntern("Alice", "Novakova", "alice");
        long bobId = insertIntern("Bob", "Svoboda", "bob");
        assignInternToProject(aliceId, projectId, true);
        assignInternToProject(bobId, projectId, false);

        insertReport(repositoryId, OffsetDateTime.parse("2024-01-10T09:00:00Z"), new BigDecimal("5.0000"), "alice", BigDecimal.valueOf(80));
        insertReport(repositoryId, OffsetDateTime.parse("2024-02-05T10:00:00Z"), new BigDecimal("3.0000"), "alice", BigDecimal.valueOf(80));
        insertReport(repositoryId, OffsetDateTime.parse("2024-02-12T11:00:00Z"), new BigDecimal("2.0000"), "bob", BigDecimal.valueOf(120));

        String responseJson = mockMvc.perform(get("/api/projects/{projectId}/reports/long-term", projectId)
                        .param("from", "2024-01-01")
                        .param("to", "2024-03-31"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        ProjectReportDetailController.ProjectLongTermReportResponse response =
                objectMapper.readValue(responseJson, ProjectReportDetailController.ProjectLongTermReportResponse.class);

        assertThat(response.meta().budget()).isEqualTo(1000);
        assertThat(response.meta().budgetFrom()).isEqualTo(LocalDate.of(2024, 1, 1));
        assertThat(response.meta().budgetTo()).isEqualTo(LocalDate.of(2024, 3, 31));
        assertThat(response.meta().hourlyRate()).isEqualByComparingTo("100.00");

        assertThat(response.totalHours()).isEqualByComparingTo("10.0000");
        assertThat(response.totalCost()).isEqualByComparingTo("800.0000");

        List<ProjectReportDetailController.ProjectLongTermReportMonth> months = response.months();
        assertThat(months).hasSize(3);

        ProjectReportDetailController.ProjectLongTermReportMonth january = months.get(0);
        assertThat(january.monthStart()).isEqualTo(OffsetDateTime.parse("2024-01-01T00:00:00Z"));
        assertThat(january.hours()).isEqualByComparingTo("5.0000");
        assertThat(january.cost()).isEqualByComparingTo("500.0000");
        assertThat(january.cumulativeHours()).isEqualByComparingTo("5.0000");
        assertThat(january.cumulativeCost()).isEqualByComparingTo("500.0000");
        assertThat(january.burnRatio()).isEqualByComparingTo("0.5000");

        ProjectReportDetailController.ProjectLongTermReportMonth february = months.get(1);
        assertThat(february.monthStart()).isEqualTo(OffsetDateTime.parse("2024-02-01T00:00:00Z"));
        assertThat(february.hours()).isEqualByComparingTo("5.0000");
        assertThat(february.cost()).isEqualByComparingTo("300.0000");
        assertThat(february.cumulativeHours()).isEqualByComparingTo("10.0000");
        assertThat(february.cumulativeCost()).isEqualByComparingTo("800.0000");
        assertThat(february.burnRatio()).isEqualByComparingTo("0.8000");

        ProjectReportDetailController.ProjectLongTermReportMonth march = months.get(2);
        assertThat(march.monthStart()).isEqualTo(OffsetDateTime.parse("2024-03-01T00:00:00Z"));
        assertThat(march.hours()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(march.cost()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(march.cumulativeHours()).isEqualByComparingTo("10.0000");
        assertThat(march.cumulativeCost()).isEqualByComparingTo("800.0000");
        assertThat(march.burnRatio()).isEqualByComparingTo("0.8000");
    }

    @Test
    void rejectsInvalidDateRange() throws Exception {
        mockMvc.perform(get("/api/projects/{projectId}/reports/long-term", 1)
                        .param("from", "2024-04-01")
                        .param("to", "2024-03-01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION"));
    }

    private long insertProject(String name,
                               Integer budget,
                               LocalDate budgetFrom,
                               LocalDate budgetTo,
                               BigDecimal hourlyRate) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO project (name, budget, budget_from, budget_to, namespace_id, namespace_name, is_external, hourly_rate_czk) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                name,
                budget,
                budgetFrom,
                budgetTo,
                1_000L,
                "Namespace",
                true,
                hourlyRate.setScale(2, RoundingMode.HALF_UP));
    }

    private long insertRepository(long gitlabId, String name, String namespace) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO repository (gitlab_repo_id, name, name_with_namespace, namespace_id, namespace_name, root_repo) " +
                        "VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                Long.class,
                gitlabId,
                name,
                namespace,
                1_000L,
                "Namespace",
                false);
    }

    private void linkProjectRepository(long projectId, long repositoryId) {
        jdbcTemplate.update("INSERT INTO projects_to_repositorie (project_id, repository_id) VALUES (?, ?)", projectId, repositoryId);
    }

    private long insertIntern(String firstName, String lastName, String username) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO intern (first_name, last_name, username) VALUES (?, ?, ?) RETURNING id",
                Long.class,
                firstName,
                lastName,
                username);
    }

    private void assignInternToProject(long internId, long projectId, boolean includeInCost) {
        jdbcTemplate.update(
                "INSERT INTO intern_project (intern_id, project_id, workload_hours, include_in_reported_cost) VALUES (?, ?, ?, ?)",
                internId,
                projectId,
                null,
                includeInCost);
    }

    private void insertReport(long repositoryId,
                               OffsetDateTime spentAt,
                               BigDecimal hours,
                               String username,
                               BigDecimal hourlyRate) {
        int seconds = hours.multiply(BigDecimal.valueOf(3600)).intValueExact();
        BigDecimal roundedHours = hours.setScale(4, RoundingMode.HALF_UP);
        BigDecimal rate = hourlyRate.setScale(2, RoundingMode.HALF_UP);
        BigDecimal cost = roundedHours.multiply(rate).setScale(4, RoundingMode.HALF_UP);

        jdbcTemplate.update(
                "INSERT INTO report (repository_id, iid, spent_at, time_spent_seconds, time_spent_hours, username, cost, hourly_rate_czk) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                repositoryId,
                null,
                spentAt,
                seconds,
                roundedHours,
                username,
                cost,
                rate);
    }
}
